/** Canonical journey shared with a second owned advertising source. No rows are copied. */
export const HISTORINHA_JOURNEY = {
    sourceId: 'bcad48f8-de1f-4501-8dea-4810dc3b248d',
    sharedSourceId: 'fb8d4d3b-2603-4c55-8655-51ca086f3091',
    slug: 'mamae-quero-historinha',
    productIds: ['121023', '41ebc95a-1a8a-4f30-83a9-626568317d1b', '99c7c330-c1f5-11f1-b00d-df691146d26d'],
} as const;

// Only server-defined SQL identifiers/placeholders are accepted. Ownership is checked
// in the query as well as the route authorization; another tenant can never inherit data.
export function quizSourceScope(alias = 'f', sourceParam = '$1'): string {
    if (!/^[a-z][a-z0-9_]*$/.test(alias) || !/^\$[1-9][0-9]*$/.test(sourceParam)) throw Error('Invalid scope');
    const j = HISTORINHA_JOURNEY;
    return `(${alias}.source_id=${sourceParam} OR (${sourceParam}::uuid='${j.sharedSourceId}'::uuid
        AND ${alias}.source_id='${j.sourceId}'::uuid AND ${alias}.slug='${j.slug}'
        AND EXISTS(SELECT 1 FROM tracking_sources canonical_source JOIN tracking_sources viewing_source
          ON viewing_source.user_id=canonical_source.user_id
          WHERE canonical_source.id=${alias}.source_id AND viewing_source.id=${sourceParam})))`;
}

export function sharedOrderScope(alias = 'o', sourceParam = '$1'): string {
    if (!/^[a-z][a-z0-9_]*$/.test(alias) || !/^\$[1-9][0-9]*$/.test(sourceParam)) throw Error('Invalid scope');
    const j = HISTORINHA_JOURNEY;
    return `(${alias}.source_id=${sourceParam} OR (${sourceParam}::uuid='${j.sharedSourceId}'::uuid
      AND ${alias}.source_id='${j.sourceId}'::uuid AND ${alias}.product_id IN (${j.productIds.map(id=>`'${id}'`).join(',')})
      AND EXISTS(SELECT 1 FROM tracking_sources canonical_source JOIN tracking_sources viewing_source
        ON viewing_source.user_id=canonical_source.user_id WHERE canonical_source.id=${alias}.source_id AND viewing_source.id=${sourceParam})))`;
}

export function sameJourneyProductSql(left:string,right:string):string{
    if(!/^[a-z][a-z0-9_]*$/.test(left)||!/^[a-z][a-z0-9_]*$/.test(right))throw Error('Invalid aliases');
    const j=HISTORINHA_JOURNEY,products=j.productIds.map(id=>`'${id}'`).join(','),sources=[j.sourceId,j.sharedSourceId].map(id=>`'${id}'`).join(',');
    return `((${left}.source_id=${right}.source_id AND ${left}.product_id=${right}.product_id AND ${left}.product_id IS NOT NULL)
      OR (${left}.source_id IN (${sources}) AND ${right}.source_id IN (${sources})
        AND ${left}.product_id IN (${products}) AND ${right}.product_id IN (${products})
        AND EXISTS(SELECT 1 FROM tracking_sources left_source JOIN tracking_sources right_source ON right_source.user_id=left_source.user_id
          WHERE left_source.id=${left}.source_id AND right_source.id=${right}.source_id)))`;
}
