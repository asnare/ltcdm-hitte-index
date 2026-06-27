export function celsiusToFahrenheit(value) {
    return (value * 9) / 5 + 32;
}

export function fahrenheitToCelsius(value) {
    return ((value - 32) * 5) / 9;
}

export function heatIndexCelsius(temperatureC, humidityPct) {
    const humidity = Math.max(0, Math.min(100, humidityPct));
    const temperatureF = celsiusToFahrenheit(temperatureC);

    const simple =
        0.5
        * (temperatureF
            + 61
            + (temperatureF - 68) * 1.2
            + humidity * 0.094);

    if ((simple + temperatureF) / 2 < 80) {
        return fahrenheitToCelsius(simple);
    }

    let heatIndexF =
        -42.379
        + 2.04901523 * temperatureF
        + 10.14333127 * humidity
        - 0.22475541 * temperatureF * humidity
        - 0.00683783 * temperatureF * temperatureF
        - 0.05481717 * humidity * humidity
        + 0.00122874 * temperatureF * temperatureF * humidity
        + 0.00085282 * temperatureF * humidity * humidity
        - 0.00000199 * temperatureF * temperatureF * humidity * humidity;

    if (humidity < 13 && temperatureF >= 80 && temperatureF <= 112) {
        heatIndexF -=
            ((13 - humidity) / 4)
            * Math.sqrt((17 - Math.abs(temperatureF - 95)) / 17);
    } else if (humidity > 85 && temperatureF >= 80 && temperatureF <= 87) {
        heatIndexF += ((humidity - 85) / 10) * ((87 - temperatureF) / 5);
    }

    return fahrenheitToCelsius(heatIndexF);
}
