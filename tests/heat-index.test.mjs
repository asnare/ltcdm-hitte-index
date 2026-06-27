import assert from "node:assert/strict";
import test from "node:test";
import { heatIndexCelsius } from "../scripts/heat-index.mjs";

test("cooler conditions use the NWS simple formula", () => {
    assert.equal(Number(heatIndexCelsius(20, 50).toFixed(1)), 19.4);
});

test("Rothfusz regression matches a known value", () => {
    assert.equal(Number(heatIndexCelsius(30, 70).toFixed(1)), 35.0);
});

test("high-humidity adjustment is applied", () => {
    assert.equal(Number(heatIndexCelsius(30, 90).toFixed(1)), 40.8);
});

test("humidity is clamped", () => {
    assert.equal(
        Number(heatIndexCelsius(28, 140).toFixed(3)),
        Number(heatIndexCelsius(28, 100).toFixed(3)),
    );
});
