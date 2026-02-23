export const testSteps = {
  unit: { label: "Unit Tests", command: "npm", args: ["run", "test"] },
  build: { label: "Build", command: "npm", args: ["run", "build"] },
  smoke: { label: "Smoke Tests", command: "npm", args: ["run", "test:smoke"] },
  system: { label: "System Tests", command: "npm", args: ["run", "test:system"] },
};

export const pipelines = {
  quick: ["unit", "build"],
  full: ["unit", "build", "smoke"],
  phase7: ["unit", "build", "smoke", "system"],
  e2e: ["unit", "build", "smoke", "system"],
};
