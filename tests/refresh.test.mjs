import assert from "node:assert/strict";
import test from "node:test";
import { buildHistory, buildPayload } from "../scripts/refresh.mjs";

test("payload contains 15 days of half-hour points plus final endpoint", () => {
    const payload = buildPayload(new Date("2026-06-27T12:17:00Z"), {
        liveAvailable: false,
    });

    assert.equal(payload.slots.length, 15 * 48 + 1);
    assert.equal(payload.location.name, "LTC de Meent");
    assert.equal(payload.current.source, "sample");
});

test("each row starts at local midnight and has one local day", () => {
    const payload = buildPayload(new Date("2026-06-27T12:17:00Z"), {
        liveAvailable: false,
    });

    assert.match(payload.slots[0].time, /T00:00:00\+02:00$/);
    assert.match(payload.slots[47].time, /T23:30:00\+02:00$/);
    assert.match(payload.slots[48].time, /T00:00:00\+02:00$/);
    assert.match(payload.slots[720].time, /T00:00:00\+02:00$/);
});

test("current slot is sourced from open-meteo-estimate when liveAvailable", () => {
    const payload = buildPayload(new Date("2026-06-27T14:38:00Z"), {
        liveAvailable: true,
    });

    assert.equal(payload.current.source, "open-meteo-estimate");
});

test("cell values are sampled at the rounded point in time", () => {
    const payload = buildPayload(new Date("2026-06-27T12:17:00Z"), {
        liveAvailable: true,
        openMeteoPayload: {
            hourly: {
                time: ["2026-06-20T00:00", "2026-06-20T01:00"],
                temperature_2m: [10, 14],
                relative_humidity_2m: [50, 70],
            },
        },
    });

    assert.equal(payload.slots[0].time, "2026-06-20T00:00:00+02:00");
    assert.equal(payload.slots[0].temperatureC, 10);
    assert.equal(payload.slots[0].humidityPct, 50);
    assert.equal(payload.slots[1].temperatureC, 12);
    assert.equal(payload.slots[1].humidityPct, 60);
});

test("history records only changes and drops duplicates", () => {
    const first = buildPayload(new Date("2026-06-27T12:17:00Z"), {
        liveAvailable: true,
        openMeteoPayload: {
            hourly: {
                time: ["2026-06-27T12:00", "2026-06-28T00:00"],
                temperature_2m: [20, 24],
                relative_humidity_2m: [60, 60],
            },
        },
    });
    const firstHistory = buildHistory({}, first);

    // First run: every slot gets exactly one entry
    for (const entries of Object.values(firstHistory.slots)) {
        assert.equal(entries.length, 1);
    }

    const second = buildPayload(new Date("2026-06-27T12:47:00Z"), {
        liveAvailable: true,
        openMeteoPayload: {
            hourly: {
                time: ["2026-06-27T12:00", "2026-06-28T00:00"],
                temperature_2m: [22, 26],
                relative_humidity_2m: [60, 60],
            },
        },
    });
    const secondHistory = buildHistory(firstHistory, second);

    // Slots with changed values accumulate a second entry
    const changed = Object.values(secondHistory.slots).filter((e) => e.length === 2);
    assert.ok(changed.length > 0);

    // Unchanged slots keep one entry
    const unchanged = Object.values(secondHistory.slots).filter((e) => e.length === 1);
    assert.ok(unchanged.length > 0);

});
