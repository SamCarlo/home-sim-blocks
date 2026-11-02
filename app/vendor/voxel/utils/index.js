// BLOCKS: transpiled from upstream TypeScript with esbuild --format=esm; relative imports given .js paths.
const htmlToDom = (html) => {
  const templateDom = document.createElement("template");
  templateDom.innerHTML = html;
  window.document.body.appendChild(templateDom.content);
};
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(
  navigator.userAgent
);
export {
  htmlToDom,
  isMobile
};
