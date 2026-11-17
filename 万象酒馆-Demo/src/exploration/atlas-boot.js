if (new URLSearchParams(location.search).get('atlas-only') === '1') {
  document.documentElement.dataset.atlasOnly = 'true';
}
