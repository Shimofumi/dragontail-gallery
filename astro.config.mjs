// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NSFW作品のURLを取得する関数
function getNSFWUrls() {
    const pictureDir = path.join(__dirname, 'src', 'pages', 'picture');
    const files = fs.readdirSync(pictureDir);
    /** @type {string[]} */
    const nsfwUrls = [];

    files.forEach(file => {
        if (file.endsWith('.md')) {
            const content = fs.readFileSync(path.join(pictureDir, file), 'utf-8');
            // フロントマターからtagsを抽出
            const tagsMatch = content.match(/tags:\s*\[(.*?)\]/s);
            if (tagsMatch) {
                const tags = tagsMatch[1];
                // R18またはR18Gタグを含む作品を除外リストに追加
                if (tags.includes('"R18"') || tags.includes('"R18G"')) {
                    const slug = file.replace('.md', '');
                    nsfwUrls.push(`/picture/${slug}/`);
                }
            }
        }
    });

    return nsfwUrls;
}

const nsfwUrls = getNSFWUrls();

// https://astro.build/config
export default defineConfig({
    site: 'https://dragontail.monster',
    integrations: [
        mdx(),
        sitemap({
            filter: (page) => {
                // NSFW関連のディレクトリを除外
                if (page.includes('/nsfw-gallery/')) return false;
                if (page.includes('/nsfw-downloads/')) return false;
                if (page.includes('/nsfw-rss.xml')) return false;

                // NSFW作品ページを除外
                const pagePath = new URL(page).pathname;
                return !nsfwUrls.some(url => pagePath.includes(url));
            }
        })
    ],
});
