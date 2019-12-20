const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');

const database = {
    bookmarks: null,
    bookmarkThreads: [],
    posts: null,
};

const grepolis = {
    fetchLink: "https://pl84.grepolis.com/game/alliance_forum?town_id=16422&action=forum&h=40597ed6f84a5be633c7d94723328bc605937c67",
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
                "cookie": "sid=8s88s00oswos0gkk4g00gc8k0cww8k0cgw4cs0gk8g08cwsckwc8w8ksk804kgs0",
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
        grepolis.html = json.plain.html;
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
            await $('.title_author_wrapper > .title > a').each((index, element) => {
                const threadTitle = $(element).text();
                const threadId = $(element).attr('onclick').match('[0-9]+')[0];
                threads.push({
                    threadId,
                    threadTitle,
                })
            });
            database.bookmarkThreads.push({ bookmarkId, bookmarkTitle, threads });
        }
        console.log(JSON.stringify(database.bookmarkThreads, null, 2));
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
        console.log(posts);
    }
};

(async () => {
    await grepolis.fetch({forum_id: 1687}).catch(err => { console.error('No data returned', err); process.exit()});
    // await grepolis.saveToFile('file2.html');
    await grepolis.parseBookmarks();
    console.log(database.bookmarks);
    await grepolis.parseForumThreads();
    // await grepolis.parseForumPosts();
})();

