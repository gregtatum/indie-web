import { spawn } from "node:child_process";

const checks = [
  { task: "lint-js", label: "Lint JS" },
  { task: "lint-css", label: "Lint CSS" },
  { task: "ts", label: "TypeScript" },
  { task: "test-frontend", label: "Test frontend" },
  { task: "test-server", label: "Test server" },
];

const isInteractive = Boolean(process.stdout.isTTY);
const labelWidth = Math.max(...checks.map((check) => check.label.length));
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function color(text, colorName) {
  if (!isInteractive) {
    return text;
  }
  return `${colors[colorName]}${text}${colors.reset}`;
}

function statusGlyph(result, { isRunning = false } = {}) {
  if (!result) {
    return isRunning ? color("•", "dim") : color("·", "dim");
  }
  return result.exitCode === 0 ? color("✓", "green") : color("x", "red");
}

function formatRow(check, result, { isRunning = false } = {}) {
  const label = check.label.padEnd(labelWidth);
  const suffix = isRunning
    ? " running..."
    : result
      ? ` ${formatDuration(result.durationMs)}`
      : "";

  return `${statusGlyph(result, { isRunning })} ${label}${suffix}`;
}

function checkEnv() {
  const env = {
    ...process.env,
    TERM: process.env.TERM || "xterm-256color",
  };

  if (isInteractive) {
    env.FORCE_COLOR = "1";
    delete env.NO_COLOR;
  }

  return env;
}

function renderInteractive(results, activeIndex = -1) {
  if (renderInteractive.hasRendered) {
    process.stdout.write(`\x1b[${checks.length}F`);
  }

  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    const result = results.get(check.task);
    const line = formatRow(check, result, { isRunning: index === activeIndex });

    process.stdout.write(`\x1b[2K${line}\n`);
  }

  renderInteractive.hasRendered = true;
}

renderInteractive.hasRendered = false;

function runCheck(check) {
  const startedAt = Date.now();
  const child = spawn("task", ["--silent", "--exit-code", check.task], {
    env: checkEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk;
  });

  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  return new Promise((resolve) => {
    child.on("error", (error) => {
      resolve({
        ...check,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode: 1,
        output: `${output}${error.message}\n`,
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        ...check,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode,
        output,
      });
    });
  });
}

function printFailures(results) {
  const failures = results.filter((result) => result.exitCode !== 0);

  if (failures.length === 0) {
    return;
  }

  console.log("Failures");
  console.log("========");

  for (const result of failures) {
    console.log();
    console.log(`${result.label} failed with exit code ${result.exitCode}`);
    console.log(`Command: task --silent --exit-code ${result.task}`);
    console.log("--------");
    const output = cleanTaskOutput(result);
    process.stdout.write(output || "(no output)\n");
    if (output && !output.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }

  console.log();
}

function cleanTaskOutput(result) {
  return result.output
    .split("\n")
    .filter((line) => !line.startsWith(`task: Failed to run task "${result.task}"`))
    .join("\n");
}

function printResults(results) {
  console.log("Results");
  console.log("=======");

  for (const result of results) {
    const retry = result.exitCode === 0 ? "" : `  run: task ${result.task}`;
    console.log(`${formatRow(result, result)}${retry}`);
  }
}

async function main() {
  const results = [];
  const resultsByTask = new Map();

  if (isInteractive) {
    renderInteractive(resultsByTask);
  }

  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];

    if (isInteractive) {
      renderInteractive(resultsByTask, index);
    } else {
      console.log(formatRow(check, undefined, { isRunning: true }));
    }

    const result = await runCheck(check);
    results.push(result);
    resultsByTask.set(check.task, result);

    if (isInteractive) {
      renderInteractive(resultsByTask);
    } else {
      console.log(formatRow(check, result));
    }

    if (!isInteractive && result.exitCode !== 0) {
      break;
    }
  }

  if (isInteractive && renderInteractive.hasRendered) {
    console.log();
  }

  printFailures(results);
  printResults(results);

  if (results.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1;
  }
}

await main();
