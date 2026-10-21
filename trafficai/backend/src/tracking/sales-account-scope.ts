/** Advertising attribution is independent of the source receiving the webhook.
 * Never route by product name, IP or the pixel receiving a mirrored CAPI event.
 * Only a unique campaign owned by the same tenant identifies an ad account.
 */
export function salesAccountScope(alias = 'o', sourceParam = '$1', accountIds?: string[]): string {
    if (!/^[a-z][a-z0-9_]*$/.test(alias) || !/^\$[1-9][0-9]*$/.test(sourceParam)) throw Error('Invalid scope');
    if (accountIds?.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw Error('Invalid account');
    const selected = accountIds?.length
        ? `ARRAY[${[...new Set(accountIds)].map(id => `'${id}'::uuid`).join(',')}]`
        : 'ARRAY[viewing.account_id]';
    return `EXISTS (SELECT 1 FROM tracking_sources viewing
      JOIN tracking_sources canonical ON canonical.user_id=viewing.user_id
      WHERE viewing.id=${sourceParam} AND canonical.id=${alias}.source_id AND (
        (viewing.account_id IS NULL AND ${accountIds?.length ? 'FALSE' : 'TRUE'} AND canonical.id=viewing.id)
        OR (NULLIF(${alias}.meta_campaign_id,'') IS NULL AND canonical.account_id=ANY(${selected}))
        OR (NULLIF(${alias}.meta_campaign_id,'') IS NOT NULL AND
          (SELECT CASE WHEN COUNT(DISTINCT campaign.account_id)=1 THEN MIN(campaign.account_id::text)::uuid END
           FROM campaigns campaign JOIN ad_accounts owned ON owned.id=campaign.account_id
           WHERE owned.user_id=viewing.user_id AND campaign.meta_campaign_id=${alias}.meta_campaign_id)=ANY(${selected}))
      ))`;
}

/** Costs belong to their original source, independent of campaign routing. */
export function salesSourceScope(sourceParam = '$1', accountIds?: string[]): string {
    if (!/^\$[1-9][0-9]*$/.test(sourceParam) || accountIds?.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw Error('Invalid scope');
    if (!accountIds?.length) return sourceParam;
    return `SELECT scoped.id FROM tracking_sources scoped JOIN tracking_sources viewing ON viewing.user_id=scoped.user_id
      WHERE viewing.id=${sourceParam} AND scoped.account_id IN (${[...new Set(accountIds)].map(id=>`'${id}'::uuid`).join(',')})`;
}
