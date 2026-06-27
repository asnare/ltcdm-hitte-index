import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { heatIndexCelsius } from "./heat-index.mjs";

const LOCATION = {
    name: "LTC de Meent",
    lat: 52.27708,
    lon: 5.14383,
};
const TIME_ZONE = "Europe/Amsterdam";
const SLOT_MINUTES = 30;
const DAY_COUNT = 15;
const SLOTS_PER_DAY = 48;
const POINT_COUNT = DAY_COUNT * SLOTS_PER_DAY + 1;
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

function parseArgs(argv) {
    const args = {
        output: "public/data/heat-index.json",
        history: "public/data/heat-index-history.json",
        sample: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--sample") {
            args.sample = true;
        } else if (argv[index] === "--output") {
            args.output = argv[index + 1];
            index += 1;
        } else if (argv[index] === "--history") {
            args.history = argv[index + 1];
            index += 1;
        }
    }
    return args;
}

function localParts(date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    return Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, Number(part.value)]),
    );
}

function timeZoneOffsetMs(date) {
    const parts = localParts(date);
    const localAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );
    return localAsUtc - date.getTime();
}

function zonedTimeToDate(year, month, day, hour = 0, minute = 0) {
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    let utc = localAsUtc;
    for (let index = 0; index < 2; index += 1) {
        utc = localAsUtc - timeZoneOffsetMs(new Date(utc));
    }
    return new Date(utc);
}

function localIso(date) {
    const parts = localParts(date);
    const offsetMinutes = timeZoneOffsetMs(date) / 60000;
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
    const offsetRemainder = String(absOffset % 60).padStart(2, "0");
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:00${sign}${offsetHours}:${offsetRemainder}`;
}

function roundSlot(date) {
    const parts = localParts(date);
    const minute = parts.minute < 30 ? 0 : 30;
    return zonedTimeToDate(parts.year, parts.month, parts.day, parts.hour, minute);
}

function slotStart(now) {
    const parts = localParts(now);
    const todayMidnight = zonedTimeToDate(parts.year, parts.month, parts.day);
    return new Date(todayMidnight.getTime() - 7 * 24 * 60 * 60_000);
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60_000);
}

function sourceForSlot(slot, now, liveAvailable) {
    if (!liveAvailable) {
        return "sample";
    }
    if (slot < roundSlot(now)) return "open-meteo-past";
    if (slot.getTime() === roundSlot(now).getTime()) return "open-meteo-estimate";
    return "open-meteo-forecast";
}

function sampleConditions(slot, now) {
    const slotParts = localParts(slot);
    const nowParts = localParts(now);
    const slotNoon = zonedTimeToDate(slotParts.year, slotParts.month, slotParts.day, 12);
    const nowNoon = zonedTimeToDate(nowParts.year, nowParts.month, nowParts.day, 12);
    const dayOffset = Math.round((slotNoon - nowNoon) / 86_400_000);
    const hour = slotParts.hour + slotParts.minute / 60;
    const daylight = Math.max(0, Math.sin(((hour - 6) / 15) * Math.PI));
    const trend = Math.min(4, Math.max(-2, dayOffset * 0.25));
    const temperature = 18 + 13 * daylight + trend;
    const humidity = 78 - 32 * daylight + 8 * Math.sin(dayOffset / 2);
    return {
        temperatureC: Number(temperature.toFixed(1)),
        humidityPct: Math.round(Math.max(30, Math.min(95, humidity))),
    };
}

async function fetchOpenMeteo() {
    const url = new URL(OPEN_METEO_FORECAST_URL);
    url.search = new URLSearchParams({
        latitude: String(LOCATION.lat),
        longitude: String(LOCATION.lon),
        hourly: "temperature_2m,relative_humidity_2m",
        timezone: TIME_ZONE,
        past_days: "7",
        forecast_days: "8",
        models: "knmi_seamless",
        cell_selection: "nearest",
        elevation: "nan",
    });

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Open-Meteo request failed: ${response.status}`);
    }
    return response.json();
}


function parseOpenMeteoLocalTime(value) {
    const [datePart, timePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return zonedTimeToDate(year, month, day, hour, minute);
}

function buildOpenMeteoLookup(payload) {
    return {
        times: payload.hourly.time.map(parseOpenMeteoLocalTime),
        temperatures: payload.hourly.temperature_2m,
        humidities: payload.hourly.relative_humidity_2m,
    };
}

function interpolate(times, values, slot) {
    let index = 0;
    while (index < times.length && times[index] <= slot) {
        index += 1;
    }
    const previousIndex = index - 1;
    if (previousIndex < 0) {
        return null;
    }
    if (previousIndex >= times.length - 1 || times[previousIndex].getTime() === slot.getTime()) {
        return values[previousIndex];
    }

    const previousValue = values[previousIndex];
    const nextValue = values[previousIndex + 1];
    if (previousValue === null || nextValue === null) {
        return null;
    }

    const span = times[previousIndex + 1] - times[previousIndex];
    const offset = slot - times[previousIndex];
    return previousValue + (nextValue - previousValue) * (offset / span);
}

export function buildPayload(
    now,
    {
        liveAvailable = false,
        openMeteoPayload = null,
    } = {},
) {
    const start = slotStart(now);
    const currentSlot = roundSlot(now);
    const lookup = openMeteoPayload ? buildOpenMeteoLookup(openMeteoPayload) : null;
    const slots = [];
    let current = null;

    for (let index = 0; index < POINT_COUNT; index += 1) {
        const slot = addMinutes(start, SLOT_MINUTES * index);
        let conditions;

        if (lookup) {
            conditions = {
                temperatureC: interpolate(lookup.times, lookup.temperatures, slot),
                humidityPct: interpolate(lookup.times, lookup.humidities, slot),
            };
        } else {
            conditions = sampleConditions(slot, now);
        }

        const heatIndexC =
            conditions.temperatureC === null || conditions.humidityPct === null
                ? null
                : Number(heatIndexCelsius(conditions.temperatureC, conditions.humidityPct).toFixed(1));

        const item = {
            time: localIso(slot),
            temperatureC:
                conditions.temperatureC === null
                    ? null
                    : Number(conditions.temperatureC.toFixed(1)),
            humidityPct:
                conditions.humidityPct === null
                    ? null
                    : Math.round(conditions.humidityPct),
            heatIndexC,
            source: sourceForSlot(slot, now, liveAvailable),
        };

        slots.push(item);
        if (current === null && slot.getTime() === currentSlot.getTime()) {
            current = item;
        }
    }

    return {
        generatedAt: now.toISOString(),
        location: LOCATION,
        current: current ?? slots[Math.min(slots.length - 1, 7 * SLOTS_PER_DAY)],
        slots,
    };
}

function sameValue(left, right) {
    return (
        left?.temperatureC === right?.temperatureC
        && left?.humidityPct === right?.humidityPct
        && left?.heatIndexC === right?.heatIndexC
        && left?.source === right?.source
    );
}

function comparableSlot(slot) {
    return {
        temperatureC: slot.temperatureC,
        humidityPct: slot.humidityPct,
        heatIndexC: slot.heatIndexC,
        source: slot.source,
    };
}

async function readJson(path, fallback) {
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT") {
            return fallback;
        }
        throw error;
    }
}

export function buildHistory(previousHistory, payload) {
    const slots = { ...(previousHistory.slots ?? {}) };

    for (const slot of payload.slots) {
        const existing = slots[slot.time] ?? [];
        const candidate = comparableSlot(slot);
        if (!sameValue(existing[existing.length - 1], candidate)) {
            slots[slot.time] = [...existing, { detectedAt: payload.generatedAt, ...candidate }];
        }
    }

    return {
        version: 2,
        location: payload.location,
        updatedAt: payload.generatedAt,
        slots,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const now = new Date();
    const openMeteoPayload = args.sample ? null : await fetchOpenMeteo();

    const payload = buildPayload(now, {
        liveAvailable: !args.sample,
        openMeteoPayload,
    });
    const previousHistory = await readJson(args.history, {});
    const history = buildHistory(previousHistory, payload);

    await mkdir(dirname(args.output), { recursive: true });
    await mkdir(dirname(args.history), { recursive: true });
    await writeFile(args.output, `${JSON.stringify(payload, null, 2)}\n`);
    await writeFile(args.history, `${JSON.stringify(history, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
