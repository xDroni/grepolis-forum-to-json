const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');

const database = {
    bookmarks: null,
    bookmarkThreads: [],
    posts: null,
};

const grepolis = {
    fetchLink: "https://pl84.grepolis.com/game/alliance_forum?town_id=16422&action=forum&h=2f71ab6273b617319a63c213ad5b781a8de1bbfb",
    html: null,
    // data: {
    //     // "type": "go",
    //     // "separate": "false",
    //     "forum_id": "1688",
    //     // "thread_id": "6471",
    //     "page": "1",
    //     // "nl_init": "true"
    // },
    fetch: async (data) => {
        const res = await fetch(grepolis.fetchLink, {
            // "credentials": "include",
            "headers": {
                "cookie": "sid=sogcc8gck8k048cgs4cc84s0wg8gwwgkkkg0ccwg0kww00owkoc0g08kgsks0sg4",
                // "accept": "text/plain, */*; q=0.01",
                // "accept-language": "en-US,en;q=0.9",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                // "sec-fetch-mode": "cors",
                // "sec-fetch-site": "same-origin",
                "x-requested-with": "XMLHttpRequest"
            },
            // "referrer": "https://pl84.grepolis.com/game/index?login=1&p=974498&ts=1576827200",
            // "referrerPolicy": "no-referrer-when-downgrade",
            "body": "json="+JSON.stringify(data),
            "method": "POST",
            // "mode": "cors"
        });
        const json = await res.json();
        // console.log(json);
        try {
            grepolis.html = json.plain.html;
        } catch {
            console.error(json);
            process.exit(1);
        }
    },

    saveToFile: (filename) => {
        fs.writeFileSync(filename, grepolis.html, (err) => {
            if(err) console.log(err);
            else console.log('file saved');
        })
    },

    parseBookmarks: async () => {
        // const test = fs.readFileSync('file2.html').toString();
        const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
        const bookmarks = [];
        await $('select[name="forum[forum_id]"] > option').each((index, element) => {
            const forumId = $(element).attr('value');
            const name = $(element).text();
            bookmarks.push({
                forumId,
                name,
            })
        });
        database.bookmarks = bookmarks;
        // console.log(database.bookmarks);
    },

    parseForumThreads: async () => {
        for(let bookmark of database.bookmarks) {
            await grepolis.fetch({forum_id: bookmark['forumId']});
            // const test = fs.readFileSync('file2.html').toString();
            const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
            // const activeBookmarkTitle = $('select[name="forum[forum_id]"] > option[selected="selected"]').text();
            const bookmarkTitle = bookmark['name'];
            // const activeBookmarkId = $('select[name="forum[forum_id]"] > option[selected="selected"]').attr('value');
            const bookmarkId = bookmark['forumId'];
            const threads = [];
            const postsArray = await $('.title_author_wrapper > .title > a').toArray();
            for(let element of postsArray) {
                const threadTitle = $(element).text();
                const threadId = $(element).attr('onclick').match('[0-9]+')[0];
                await grepolis.fetch({thread_id: threadId});
                const posts = await grepolis.parseForumPosts();
                threads.push({
                    threadId,
                    threadTitle,
                    posts,
                })
            }
            database.bookmarkThreads.push({ bookmarkId, bookmarkTitle, threads });
        }
    },

    parseForumPosts: async () => {
        const $ = cheerio.load(grepolis.html, { normalizeWhitespace: true });
        const posts = [];
        await $('.content > p').each((index, element) => {
            const postText = $(element).text().trim();
            const date = $('.author').text().trim().match('[0-9]+\\.[0-9]+\\.[0-9]+\\ [0-9]+:[0-9]+')[0];
            const author = $('.author > a').attr('onclick').match('\'(.+)\'')[1];
            let lastEdited = $('.post_functions').text().trim().match('[0-9]+\\.[0-9]+\\.[0-9]+\\ [0-9]+:[0-9]+');
            if(lastEdited !== null) lastEdited = lastEdited[0];
            posts.push({date, lastEdited, author, postText});
        });
        return posts;
    }
};

(async () => {
    await grepolis.fetch({forum_id: 1687}).catch(err => { console.error(err); process.exit(1)});
    await grepolis.parseBookmarks();
    console.log(database.bookmarks);
    await grepolis.parseForumThreads();
    console.log(JSON.stringify(database.bookmarkThreads, null, 2));
})();

