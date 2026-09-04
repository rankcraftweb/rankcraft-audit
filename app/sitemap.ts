import type { MetadataRoute } from 'next';

/**
 * One URL, and that is the honest answer.
 *
 * The tool is a single page. The only other route is /report/[token],
 * and those are unlisted links handed to one person each, carrying
 * `robots: noindex, nofollow` - listing them here would both contradict
 * that and publish every audit anyone has ever run.
 *
 * No `lastModified`. This file is a static route, so a `new Date()`
 * would be frozen at build time and then change on every deploy,
 * telling Google the page was edited whenever anything else in the repo
 * was. A lastmod that moves for no reason is worse than none: Google
 * learns to ignore it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://audit.rankcraftweb.com',
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}
