Heat Index: LTC de Meent
========================

This repository contains a small single-purpose web application intended to show
heat-index data for LTC de Meent in Bussum: the current value, history based on
available data, and forecast values.

The intended primary data source is KNMI:
 - Historical data.
 - Current data.
 - Forecasts.

Until a KNMI API key is available, the published application uses temporary
no-key sources:

 - Current observed conditions for comparison: Buienradar public station feed,
   <https://data.buienradar.nl/2.0/feed/json>.
 - Forecast and temporary grid backfill data: Open-Meteo Forecast API,
   <https://open-meteo.com/en/docs>.
 - Open-Meteo is queried by latitude/longitude for `temperature_2m` and
   `relative_humidity_2m`, with `past_days=7` and `forecast_days=8`.
 - Hourly Open-Meteo values are interpolated into 30-minute point values.
 - The JSON contains 721 point values: 15 days of half-hour intervals plus the
   final midnight endpoint.
 - Each 30-minute heatmap cell represents the rounded point-in-time timestamp
   shown for that cell. For example, the `14:30` cell shows the interpolated
   value at `14:30`.
 - Nearby Buienradar station observations are stored as comparison data only;
   they do not overwrite the Open-Meteo grid value.

All data is placed as close to: 52.27708° N, 5.14383° E

Tech Stack
----------

Single-page web application, with minimum dependencies:

 - No build-time required: resources are as-is.
 - Bootstrap CSS is loaded from CDN.
 - Any other dependencies need to be considered.

The application is published to GitHub Pages via CI/CD, attached to the
`public` deployment environment.

Data Generation
---------------

Generate live temporary data from Open-Meteo with Node.js LTS:

```sh
node scripts/refresh.mjs --output public/data/heat-index.json --history public/data/heat-index-history.json
```

Generate local sample data without network access:

```sh
node scripts/refresh.mjs --sample --output public/data/heat-index.json --history public/data/heat-index-history.json
```

The refresh step writes:

 - `public/data/heat-index.json`: the current 15-day display window.
 - `public/data/heat-index-history.json`: accumulated actual point values,
   forecast runs, and forecast-change records detected between refreshes.

The generated files in `public/data/*.json` are committed so published history
and current values can be reviewed in Git.

Heat Index Formula
------------------

The application calculates heat index from air temperature and relative humidity
using the NOAA/NWS Rothfusz regression. This is the standard heat-index equation
published by the U.S. National Weather Service and is intended to match the
temperature/humidity heat-index model used by services such as KNLTB and
weerplaza.nl.

Authoritative reference:
<https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml>

Inputs:

 - `T`: air temperature in degrees Fahrenheit.
 - `RH`: relative humidity as a percentage.

Main equation:

$$
\begin{aligned}
HI ={}& -42.379
    + 2.04901523T
    + 10.14333127RH \\
    &- 0.22475541T RH
    - 0.00683783T^2
    - 0.05481717RH^2 \\
    &+ 0.00122874T^2 RH
    + 0.00085282T RH^2
    - 0.00000199T^2 RH^2
\end{aligned}
$$

For cooler conditions, the NWS simple heat-index approximation is used first:

$$
HI = 0.5 \times \left(T + 61.0 + \left((T - 68.0) \times 1.2\right) + (RH \times 0.094)\right)
$$

If the average of this approximation and the actual air temperature is below
80 °F, that value is used. Otherwise the Rothfusz regression is used, including
the NWS low-humidity and high-humidity adjustments:

Low-humidity adjustment:

$$
\frac{13 - RH}{4} \times \sqrt{\frac{17 - |T - 95|}{17}}
$$

Applied when:

$$
RH < 13 \quad\text{and}\quad 80 \le T \le 112
$$

High-humidity adjustment:

$$
\frac{RH - 85}{10} \times \frac{87 - T}{5}
$$

Applied when:

$$
RH > 85 \quad\text{and}\quad 80 \le T \le 87
$$

The calculation is performed in Fahrenheit and converted back to Celsius for
display. Heat index is a shade-based apparent temperature. Direct sunlight can
make conditions feel hotter than the displayed value.
