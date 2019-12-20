const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');

const database = {
    bookmarks: null,
    bookmarkThreads: [],
    posts: null,
};

const grepolis = {
    fetchLink: "https://pl84.grepolis.com/game/alliance_forum?town_id=16422&action=forum&h=ba0d3505d59872152c2fe1cc4f988013de34a88b",
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
                "cookie": "sid=o4kk484wcc44c4g8w00g0k0c884cck04wss04os4ww4owc8o88c0o88g8gkgk4ss",
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
            await $('.title_author_wrapper > .title > a').each(async (index, element) => {
                const threadTitle = $(element).text();
                const threadId = $(element).attr('onclick').match('[0-9]+')[0];
                await grepolis.fetch({thread_id: threadId});
                const posts = await grepolis.parseForumPosts();
                threads.push({
                    threadId,
                    threadTitle,
                    posts,
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
        return posts;
    }
};

(async () => {
    await grepolis.fetch({forum_id: 1687}).catch(err => { console.error(err); process.exit(1)});
    // await grepolis.saveToFile('file2.html');
    await grepolis.parseBookmarks();
    console.log(database.bookmarks);
    await grepolis.parseForumThreads();
    // await grepolis.parseForumPosts();
})();

