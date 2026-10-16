// Consistent outlined SVG controls; decorative paths are hidden from AT.
const paths = {
  menu: "M4 6h16M4 12h16M4 18h16",
  chat: "M21 11a8 8 0 0 1-8 8H4l-2 3V11a9 9 0 0 1 19 0Z",
  settings:
    "m10 3-.5 3-2 1-3-.5-2 3 2 2v2l-2 2 2 3 3-.5 2 1 .5 3h4l.5-3 2-1 3 .5 2-3-2-2v-2l2-2-2-3-3 .5-2-1-.5-3Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  x: "m6 6 12 12M6 18 18 6",
  send: "M12 20V4m-7 7 7-7 7 7",
  stop: "M6 6h12v12H6Z",
};
export function mountIcons() {
  for (const svg of document.querySelectorAll("svg[data-icon]")) {
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", paths[svg.dataset.icon]);
    svg.append(p);
  }
}
