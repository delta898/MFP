const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDesignStyleContract({ repoRoot, initialStyle = '' }) {
  const root = { dataset: { style: initialStyle } };
  const localStorage = {
    getItem() { return null; },
    setItem() {}
  };
  const context = vm.createContext({
    document: { documentElement: root },
    window: { localStorage },
    console: { warn() {} }
  });
  const styleSystemPath = path.join(repoRoot, 'ui', 'scripts', 'foundation', 'style-system.js');
  const source = `${fs.readFileSync(styleSystemPath, 'utf8')}
;globalThis.__styleContract = {
  defaultId: DESIGN_STYLE_DEFAULT_ID,
  registry: DESIGN_STYLE_REGISTRY,
  requiredTokens: DESIGN_STYLE_REQUIRED_TOKENS,
  selectableStyles: getSelectableDesignStyles(),
  resolveDesignStyleId,
  applyDesignStyle
};`;
  vm.runInContext(source, context);
  return { root, contract: context.__styleContract };
}

function getRegisteredStyleIds(options) {
  return Object.keys(loadDesignStyleContract(options).contract.registry);
}

function getStyleModulePath(styleId) {
  return `styles/styles/${styleId}.css`;
}

function getStyleRepoPath(styleId) {
  return `ui/${getStyleModulePath(styleId)}`;
}

module.exports = {
  getRegisteredStyleIds,
  getStyleModulePath,
  getStyleRepoPath,
  loadDesignStyleContract
};
