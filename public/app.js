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
    document.querySelector(".point-cell.active")?.classList.remove("active");
    button.classList.add("active");

    const details = document.querySelector("#details");
    const date = new Date(slot.time);
    details.innerHTML = `
        <strong>${formatter.format(date)} · ${coverageRangeLabel(date)}</strong>
        <table class="details-table">
            <tbody>
                <tr>
                    <th scope="row">Hitte-index</th>
                    <td>${formatNumber(slot.heatIndexC, "°C")}</td>
                </tr>
                <tr>
                    <th scope="row">Temperatuur</th>
                    <td>${formatNumber(slot.temperatureC, "°C")}</td>
                </tr>
                <tr>
                    <th scope="row">RV</th>
                    <td>${typeof slot.humidityPct === "number" ? `${slot.humidityPct.toFixed(0)}%` : "--"}</td>
                </tr>
                <tr>
                    <th scope="row">Bron</th>
                    <td>${sourceLabel(slot)}</td>
                </tr>
            </tbody>
        </table>
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
    const table = document.createElement("table");
    table.className = "heatmap-table";
    table.innerHTML = `
        <colgroup>
            <col class="date-column">
            <col class="gap-column">
            ${Array.from({ length: 68 }, () => "<col>").join("")}
        </colgroup>
        <thead>
            <tr>
                <th scope="col"></th>
                <th scope="col"></th>
                <th scope="col" colspan="68">
                    <div class="time-axis" aria-hidden="true">
                        ${Array.from({ length: 18 }, (_, hour) => {
                            const label = String(hour + 7).padStart(2, "0");
                            return `<span class="tick" style="--hour: ${hour}">${label}</span>`;
                        }).join("")}
                    </div>
                </th>
            </tr>
        </thead>
    `;
    const tbody = document.createElement("tbody");

    for (let day = 0; day < HEATMAP_DAYS; day += 1) {
        const row = document.createElement("tr");

        const dayStart = day * SLOTS_PER_DAY;
        const visibleSlots = payload.slots.slice(
            dayStart + VISIBLE_START_INDEX,
            dayStart + SLOTS_PER_DAY + 1,
        );
        const label = document.createElement("th");
        label.scope = "row";
        label.className = "day-label";
        label.textContent = payload.slots[dayStart]
            ? formatter.format(new Date(payload.slots[dayStart].time))
            : "--";
        row.append(label);

        const gap = document.createElement("td");
        gap.className = "gap-cell";
        row.append(gap);

        visibleSlots.forEach((slot, index) => {
            const date = new Date(slot.time);
            const cell = document.createElement("td");
            cell.className = `point-cell ${levelClass(slot.heatIndexC)}`;
            cell.colSpan = index === 0 || index === visibleSlots.length - 1 ? 1 : 2;
            if (slot.time === currentTime) {
                cell.classList.add("now");
            }

            const button = document.createElement("button");
            button.type = "button";
            button.className = "cell-button";
            button.setAttribute(
                "aria-label",
                `${timeFormatter.format(date)}, ${coverageRangeLabel(date)}, hitte-index ${formatNumber(slot.heatIndexC, "°C")}`,
            );
            button.addEventListener("mouseenter", () => updateDetails(slot, cell));
            button.addEventListener("focus", () => updateDetails(slot, cell));
            button.addEventListener("click", () => updateDetails(slot, cell));
            cell.append(button);
            row.append(cell);
        });

        tbody.append(row);
    }

    table.append(tbody);
    heatmap.append(table);
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
        document.querySelector(".point-cell.now .cell-button")?.click();
    })
    .catch((error) => {
        document.querySelector("#current-meta").textContent = error.message;
        document.querySelector("#updated-at").textContent = "Gegevens niet beschikbaar";
        console.error(error);
    });
