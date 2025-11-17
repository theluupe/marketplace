function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseKeywords(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .replace(/,/g, '')
      .split(/\s+/)
      .map(keyword => keyword.trim())
      .filter(Boolean);
  }
  return [];
}

function mergeKeywords(existingKeywords, generatedKeywords) {
  const result = [];
  const seen = new Set();
  const addKeyword = keyword => {
    if (!keyword) {
      return;
    }
    const normalized = keyword.trim();
    if (!normalized) {
      return;
    }
    const normalizedLower = normalized.toLowerCase();
    if (seen.has(normalizedLower)) {
      return;
    }
    seen.add(normalizedLower);
    result.push(normalized);
  };
  existingKeywords.forEach(addKeyword);
  generatedKeywords.forEach(addKeyword);
  return result.sort();
}

function buildIncludedMap(included = []) {
  return included.reduce((acc, resource) => {
    const key = `${resource.type}:${resource.id?.uuid || resource.id}`;
    acc[key] = resource;
    return acc;
  }, {});
}

function resolveRelationship(resource, relationName, includedMap) {
  const relation = resource?.relationships?.[relationName]?.data;
  if (!relation) {
    return null;
  }
  if (Array.isArray(relation)) {
    return relation
      .map(ref => includedMap[`${ref.type}:${ref.id?.uuid || ref.id}`])
      .filter(Boolean);
  }
  return includedMap[`${relation.type}:${relation.id?.uuid || relation.id}`];
}

function getImageDownloadUrl(imageResource) {
  const variants = imageResource?.attributes?.variants || {};
  const preferredOrder = [
    'default',
    'original',
    'landscape',
    'landscape2x',
    'landscape-crop',
    'square2x',
    'square',
  ];
  for (const variantName of preferredOrder) {
    const variant = variants[variantName];
    if (variant?.url) {
      return { url: variant.url, variantName };
    }
  }
  const variantKeys = Object.keys(variants);
  if (variantKeys.length > 0) {
    const key = variantKeys[0];
    return { url: variants[key]?.url, variantName: key };
  }
  return { url: null, variantName: null };
}

module.exports = {
  wait,
  parseKeywords,
  mergeKeywords,
  buildIncludedMap,
  resolveRelationship,
  getImageDownloadUrl,
};
