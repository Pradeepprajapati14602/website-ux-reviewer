import { spawn } from "node:child_process";
import { pipelines, testSteps } from "./test-pipeline.config.mjs";

const mode = process.argv[2] || "full";

if (!pipelines[mode]) {
  console.error(`Invalid mode: ${mode}. Use ${Object.keys(pipelines).map((name) => `'${name}'`).join(", ")}.`);
  process.exit(1);
}

const steps = pipelines[mode].map((stepName) => {
  const step = testSteps[stepName];
  if (!step) {
    throw new Error(`Pipeline '${mode}' contains unknown step '${stepName}'.`);
  }
  return step;
});

function runStep(step) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      stdio: "inherit",
      shell: true,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.label} failed with exit code ${code}`));
    });
  });
}

(async () => {
  console.log(`\n🚀 Starting automated quality checks (${mode})\n`);

  for (const [index, step] of steps.entries()) {
    console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
    await runStep(step);
  }

  console.log("\n✅ All automated checks passed\n");
})().catch((error) => {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
});
