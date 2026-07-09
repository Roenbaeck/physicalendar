export const LOCAL_PROJECT_KEY = "physicalendar.project";

export function readLocalProject() {
  const text = localStorage.getItem(LOCAL_PROJECT_KEY);

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

export function writeLocalProject(project) {
  localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(project));
}

export function clearLocalProject() {
  localStorage.removeItem(LOCAL_PROJECT_KEY);
}
