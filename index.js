import { Eta } from 'eta'
import path from 'path';
import fs from 'fs';

const eta = new Eta({ views: './templates', debug: true })

function createAuthOptions(accessToken) {
    if (!accessToken) {
        throw new Error('Cannot create auth options without access token');
    }
    return {
        headers: {
            'Authorization': `token ${accessToken}`
        }
    };
}

function getAccessToken() {
    const fromArg = process.argv.slice(2).find(arg => arg.startsWith("--token="));
    const formEnv = process.env.SPOTIFY_ALBUM_REPO_ACCESS_TOKEN;
    return fromArg ? fromArg.split('=')[1] : formEnv;
}

async function getJsonFromUrl(url, authOptions) {
    const res = await fetch(url, authOptions);
    return res.json();
}

function getArtistSources(authOptions) {
    const url = 'https://raw.githubusercontent.com/AlbumShuffler/Albums/main/input/source.json';
    return getJsonFromUrl(url, authOptions);
}

function getArtistDetails(artistId, authOptions) {
    const url = `https://raw.githubusercontent.com/AlbumShuffler/Albums/main/output/${artistId}/artist`;
    return getJsonFromUrl(url, authOptions);
}

function getAlbumsForArtist(artistId, authOptions) {
    const url = `https://raw.githubusercontent.com/AlbumShuffler/Albums/main/output/${artistId}/albums`;
    return getJsonFromUrl(url, authOptions);
}

function renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName) {
    const withConvertedCovers =
        albums.map(album => {
            album.firstImage = album.images[0]
            if (album.images.length > 1) {
                album.images.shift();
            }
            if (album.name.includes("\"")) {
                album.name = album.name.replaceAll('\"', '\\\"');
            }
            return album;
        });

    if (albums.length === 0) {
        throw new Error('No album data available')
    }
    const head = withConvertedCovers[0];

    let tail = []
    if (albums.length > 1) {
        withConvertedCovers.shift();
        tail = withConvertedCovers;
    }

    return eta.render('albumstorage-for-artists', { artist: artistDetails, firstAlbum: head, albums: tail, moduleName: moduleName });
}

function renderGlobalAlbumStorageTemplate(moduleNames) {
    return eta.render('artists-with-albums', { moduleNames: moduleNames})
}

function writeTextToFile(content, filename) {
    fs.writeFileSync(filename, content, 'utf8')
}

async function handleArtist(artistId, destinationFolder, authOptions) {
    const artistDetails = await getArtistDetails(artistId, authOptions);
    const albums = await getAlbumsForArtist(artistId, authOptions);
    console.log('Found', albums.length, 'albums for', artistDetails.name);
    const moduleName = artistDetails.httpFriendlyShortName[0].toUpperCase() + artistDetails.httpFriendlyShortName.slice(1);
    const template = renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName);
    writeTextToFile(template, path.join(destinationFolder, `AlbumStorage${moduleName}.elm`));
}

function getDestination() {
    const fromArgs = process.argv.slice(2).find(arg => arg.startsWith("--destination="));
    const fallback = 'output';
    const destination = fromArgs ? fromArgs.split('=')[1] : fallback;
    console.log('Got destination', destination);
    return destination;
}

function makeSureFolderExists(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
}

function throwIfThereAreDuplicates(artistShortNames) {
    if (new Set(artistShortNames).size !== artistShortNames.length) {
        console.error(new Set(artistShortNames), artistShortNames)
        throw new Error('There are duplicate http friendly short names')
    }
}

(async () => {
    try {
        const authOptions = createAuthOptions(getAccessToken());
        const destination = getDestination();
        makeSureFolderExists(destination);

        const artistSources = await getArtistSources(authOptions);
        const artistShortNames = artistSources.map(a => a.httpFriendlyShortName);
        throwIfThereAreDuplicates(artistShortNames);

        const artistIds = artistSources.map(a => a.id);
        console.log('Got artist ids', artistIds);
        for(const artistId of artistIds) {
            console.log('Handling artist', artistId);
            handleArtist(artistId, destination, authOptions);
        }
        
        const global = renderGlobalAlbumStorageTemplate(artistShortNames.map(n => n[0].toUpperCase() + n.slice(1)));
        writeTextToFile(global, path.join(destination, `ArtistsWithAlbums.elm`));
    } catch(err) {
        console.log('Could not get artist list because', err);
    }
})();
