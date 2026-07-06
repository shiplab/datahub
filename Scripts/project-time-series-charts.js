/*
  This file draws one simple line chart from a JSON time series.
  Charts are created only when the user opens a measurement, which keeps a
  large project such as Gunnerus fast and readable.

  To change chart colours or labels, edit this file only. To add a new time
  series, add it to the project JSON; no JavaScript change is needed.
*/
window.ProjectTimeSeriesCharts = (function () {
  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    return Math.abs(value) >= 1000 ? value.toExponential(2) : value.toFixed(2);
  }

  function render(container, series, projectData) {
    container.innerHTML = "";

    if (!series.timeSeries || !Array.isArray(series.timeSeries.values)) {
      container.innerHTML = "<p class='loading-message'>No time-series values.</p>";
      return;
    }

    const values = series.timeSeries.values.map(numberValue);
    const validValues = values.filter(function (value) { return value !== null; });

    if (!validValues.length) {
      container.innerHTML = "<p class='loading-message'>No numeric values to draw.</p>";
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "measurement-chart";
    canvas.width = 900;
    canvas.height = 300;
    container.appendChild(canvas);

    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const margin = { left: 62, right: 18, top: 20, bottom: 42 };
    let minimum = Math.min.apply(null, validValues);
    let maximum = Math.max.apply(null, validValues);

    if (minimum === maximum) {
      minimum -= 1;
      maximum += 1;
    }

    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#cbd5da";
    context.fillStyle = "#66757d";
    context.font = "12px Arial";
    context.lineWidth = 1;

    for (let line = 0; line <= 4; line += 1) {
      const y = margin.top + (height - margin.top - margin.bottom) * line / 4;
      const label = maximum - (maximum - minimum) * line / 4;
      context.beginPath();
      context.moveTo(margin.left, y);
      context.lineTo(width - margin.right, y);
      context.stroke();
      context.fillText(formatNumber(label), 5, y + 4);
    }

    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const sampleStep = Math.max(1, Math.ceil(values.length / (plotWidth * 2)));
    context.strokeStyle = "#1479a8";
    context.lineWidth = 1.5;
    context.beginPath();
    let drawing = false;

    for (let index = 0; index < values.length; index += sampleStep) {
      const value = values[index];

      if (value === null) {
        drawing = false;
        continue;
      }

      const x = margin.left + plotWidth * index / Math.max(1, values.length - 1);
      const y = margin.top + plotHeight * (maximum - value) / (maximum - minimum);

      if (drawing) {
        context.lineTo(x, y);
      } else {
        context.moveTo(x, y);
        drawing = true;
      }
    }
    context.stroke();

    const axisName = series.timeSeries.time_axis || "time";
    const axisValues = window.ProjectJsonLoader.getTimeAxis(projectData, axisName);
    const firstTime = axisValues.length ? axisValues[0] : "start";
    const lastTime = axisValues.length ? axisValues[axisValues.length - 1] : "end";
    context.fillStyle = "#243138";
    context.fillText(String(firstTime), margin.left, height - 15);
    context.textAlign = "right";
    context.fillText(String(lastTime), width - margin.right, height - 15);
    context.textAlign = "center";
    context.fillText("Time", margin.left + plotWidth / 2, height - 3);
  }

  return { render: render };
}());
