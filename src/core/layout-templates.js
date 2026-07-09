export const DEFAULT_LAYOUT = {
  templateId: "classic",
  unit: "mm",
  paperWidth: 210,
  paperHeight: 297,
  marginTop: 15,
  marginRight: 10,
  marginBottom: 8,
  marginLeft: 10,
  imageRatio: "4/3",
  showMonthTitle: true,
  infoText: "Physicalendar preview",
  style: {
    accent: "#176b5b",
    imageBackground: "#ece7dd",
    titleFont: "Georgia, Times New Roman, serif",
    titleSize: 28,
    weekdaySize: 12,
    dayMinHeight: 72
  }
};

export const LAYOUT_TEMPLATES = [
  {
    id: "classic",
    label: "Classic photo",
    description: "Close to the old Calrendar layout with a large image and traditional month heading.",
    values: {
      paperWidth: 210,
      paperHeight: 297,
      marginTop: 15,
      marginRight: 10,
      marginBottom: 8,
      marginLeft: 10,
      imageRatio: "4/3",
      style: {
        accent: "#176b5b",
        imageBackground: "#ece7dd",
        titleFont: "Georgia, Times New Roman, serif",
        titleSize: 28,
        weekdaySize: 12,
        dayMinHeight: 72
      }
    }
  },
  {
    id: "gallery",
    label: "Gallery tall",
    description: "More space for the photograph, useful for portrait-heavy calendar pages.",
    values: {
      paperWidth: 210,
      paperHeight: 297,
      marginTop: 12,
      marginRight: 10,
      marginBottom: 8,
      marginLeft: 10,
      imageRatio: "3/2",
      style: {
        accent: "#8f3d49",
        imageBackground: "#eef1f2",
        titleFont: "Inter, ui-sans-serif, system-ui, sans-serif",
        titleSize: 24,
        weekdaySize: 11,
        dayMinHeight: 62
      }
    }
  },
  {
    id: "compact",
    label: "Compact notes",
    description: "A tighter image with a taller date grid for busy event calendars.",
    values: {
      paperWidth: 210,
      paperHeight: 297,
      marginTop: 13,
      marginRight: 12,
      marginBottom: 10,
      marginLeft: 12,
      imageRatio: "16/9",
      style: {
        accent: "#2d5f87",
        imageBackground: "#edf3f8",
        titleFont: "Inter, ui-sans-serif, system-ui, sans-serif",
        titleSize: 23,
        weekdaySize: 10,
        dayMinHeight: 82
      }
    }
  }
];

export function resolveLayout(layout = {}) {
  const template = templateById(layout.templateId);
  return {
    ...DEFAULT_LAYOUT,
    ...template.values,
    ...layout,
    templateId: template.id,
    style: {
      ...DEFAULT_LAYOUT.style,
      ...(template.values.style || {}),
      ...(layout.style || {})
    }
  };
}

export function applyLayoutTemplate(currentLayout = {}, templateId) {
  const template = templateById(templateId);
  const current = resolveLayout(currentLayout);

  return resolveLayout({
    ...template.values,
    templateId: template.id,
    unit: current.unit,
    infoText: current.infoText
  });
}

function templateById(templateId) {
  return LAYOUT_TEMPLATES.find((template) => template.id === templateId) || LAYOUT_TEMPLATES[0];
}
