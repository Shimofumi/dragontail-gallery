import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import type { MarkdownInstance } from 'astro';

export async function GET(context: APIContext) {
  // 全作品を読み込み
  const allPosts: MarkdownInstance<Record<string, any>>[] = Object.values(
    import.meta.glob('./picture/*.md', { eager: true })
  );

  // NSFW作品のみフィルタリング
  const nsfwPosts = allPosts.filter(post => {
    const tags = post.frontmatter.tags || [];
    return tags.includes("R18") || tags.includes("R18G");
  });

  // 日付順にソート（新しい順）
  const sortedPosts = nsfwPosts.sort((a, b) => {
    return new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime();
  });

  return rss({
    title: 'Dragontail - NSFW Gallery (18+)',
    description: '炯炯イネズによる成人向けイラスト作品。18歳未満閲覧禁止。',
    site: context.site || 'https://dragontail.monster',
    items: sortedPosts.map((post) => {
      const frontmatter = post.frontmatter;
      
      // 作品説明を作成
      const description = `タグ: ${frontmatter.tags.join(', ')}`;
      
      return {
        title: frontmatter.title,
        pubDate: new Date(frontmatter.date),
        description: description,
        link: post.url || '',
        // カスタムフィールド（画像URLなど）
        customData: `
          <content:encoded><![CDATA[
            <img src="https://dragontail.monster${frontmatter.image}" alt="${frontmatter.title}" />
            <p>${description}</p>
          ]]></content:encoded>
        `,
      };
    }),
    customData: `<language>ja</language>`,
    xmlns: {
      content: 'http://purl.org/rss/1.0/modules/content/',
    },
  });
}