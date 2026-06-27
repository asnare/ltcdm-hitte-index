const DATA_URL = "./data/heat-index.json";
const HEATMAP_DAYS = 15;
const SLOTS_PER_DAY = 48;
const VISIBLE_START_MINUTES = 7 * 60;
const VISIBLE_START_INDEX = VISIBLE_START_MINUTES / 30;

const formatter = new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "Europe/Amsterdam",
});

const timeFormatter = new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
});

const clockFormatter = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
});

function levelClass(value) {
    if (typeof value !== "number") {
        return "level-missing";
    }
    if (value < 30) {
        return "level-green";
    }
    if (value < 32) {
        return "level-yellow";
    }
    if (value < 34) {
        return "level-orange";
    }
    return "level-red";
}

function formatNumber(value, suffix) {
    if (typeof value !== "number") {
        return "--";
    }
    return `${value.toFixed(1).replace(".", ",")}${suffix}`;
}

function sourceLabel(slot) {
    if (slot.stationName) {
        return `${slot.source}: ${slot.stationName}`;
    }
    return slot.source ?? "";
}

function coverageRangeLabel(date) {
    const start = new Date(date.getTime() - 15 * 60_000);
    const end = new Date(date.getTime() + 15 * 60_000);
    return `${clockFormatter.format(start)}-${clockFormatter.format(end)}`;
}

function updateDetails(slot, button) {
    document.querySelector(".cell.active")?.classList.remove("active");
    button.classList.add("active");

    const details = document.querySelector("#details");
    const date = new Date(slot.time);
    details.innerHTML = `
        <strong>${formatter.format(date)} · ${coverageRangeLabel(date)}</strong>
        <span>Hitte-index: ${formatNumber(slot.heatIndexC, "°C")}</span>
        <span>Temperatuur: ${formatNumber(slot.temperatureC, "°C")}</span>
        <span>RV: ${typeof slot.humidityPct === "number" ? `${slot.humidityPct.toFixed(0)}%` : "--"}</span>
        <span>${sourceLabel(slot)}</span>
    `;
}

function renderCurrent(payload) {
    const current = payload.current;
    document.querySelector("#current-value").textContent = formatNumber(
        current?.heatIndexC,
        "°C",
    );
    document.querySelector("#current-conditions").textContent = `${
        formatNumber(current?.temperatureC, "°C")
    } · ${
        typeof current?.humidityPct === "number"
            ? `${current.humidityPct.toFixed(0)}% RV`
            : "--% RV"
    }`;

    const currentTime = current?.time
        ? timeFormatter.format(new Date(current.time))
        : "Niet beschikbaar";
    document.querySelector("#current-meta").textContent = current?.stationName
        ? `${currentTime} · ${current.stationName}`
        : currentTime;

    const updated = payload.generatedAt
        ? timeFormatter.format(new Date(payload.generatedAt))
        : "onbekend";
    document.querySelector("#updated-at").textContent = `Bijgewerkt ${updated}`;
}

function renderHeatmap(payload) {
    const heatmap = document.querySelector("#heatmap");
    heatmap.innerHTML = "";
    const currentTime = payload.current?.time ?? null;

    for (let day = 0; day < HEATMAP_DAYS; day += 1) {
        const row = document.createElement("div");
        row.className = "day-row";

        const dayStart = day * SLOTS_PER_DAY;
        const visibleSlots = payload.slots.slice(
            dayStart + VISIBLE_START_INDEX,
            dayStart + SLOTS_PER_DAY + 1,
        );
        const label = document.createElement("div");
        label.className = "day-label";
        label.textContent = payload.slots[dayStart]
            ? formatter.format(new Date(payload.slots[dayStart].time))
            : "--";
        row.append(label);

        visibleSlots.forEach((slot, index) => {
            const date = new Date(slot.time);
            const button = document.createElement("button");
            button.type = "button";
            button.className = `cell ${levelClass(slot.heatIndexC)}`;
            button.classList.add(
                index === 0 || index === visibleSlots.length - 1
                    ? "half-cell"
                    : "full-cell",
            );
            if (slot.time === currentTime) {
                button.classList.add("now");
            }
            button.setAttribute(
                "aria-label",
                `${timeFormatter.format(date)}, ${coverageRangeLabel(date)}, hitte-index ${formatNumber(slot.heatIndexC, "°C")}`,
            );
            button.addEventListener("mouseenter", () => updateDetails(slot, button));
            button.addEventListener("focus", () => updateDetails(slot, button));
            button.addEventListener("click", () => updateDetails(slot, button));
            row.append(button);
        });

        heatmap.append(row);
    }
}

async function loadData() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
    }
    return response.json();
}

loadData()
    .then((payload) => {
        renderCurrent(payload);
        renderHeatmap(payload);
    })
    .catch((error) => {
        document.querySelector("#current-meta").textContent = error.message;
        document.querySelector("#updated-at").textContent = "Gegevens niet beschikbaar";
        console.error(error);
    });
