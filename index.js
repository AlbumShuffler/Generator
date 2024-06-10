import { Eta } from 'eta'
import path from 'path';
import fs from 'fs';
import url from 'url'
import https from 'https'
import sizeOf from 'image-size'

const eta = new Eta({ views: './templates', debug: true })

const NUMBER_OF_REQUIRED_BYTES_FOR_IMAGE_HEAD = 5000;

/**
 * Creates authentication headers for the Spotify api based on the given access token
 * @param {String} accessToken 
 * @returns {Headers}
 */
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

/**
 * @typedef {Object} Config
 * @property {String} sourceUrl
 * @property {String} artistDetailsUrl
 * @property {String} albumsUrl
 */

/**
 * Reads the config file and returns its content as an object
 * @param {String} filename name of the config file
 * @returns {Config}
 */
function getConfigFromFile(filename) {
    try {
        return JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch(error) {
        console.error('Could not open config file because:', error);
        throw(error);
    }
}

function getConfigFromEnvironment() {
    const sourceUrl = {
        name: "source url",
        evName: "ALBUM_SHUFFLER_GENERATOR_SOURCE_URL",
        setter: (url, target) => target.sourceUrl = url
    }
    const artistDetailsUrl = {
        name: "artist details url",
        evName: "ALBUM_SHUFFLER_GENERATOR_ARTIST_DETAILS_URL",
        setter: (url, target) => target.artistDetailsUrl = url
    }
    const albumsUrl = {
        name: "source url",
        evName: "ALBUM_SHUFFLER_GENERATOR_ALBUMS_URL",
        setter: (url, target) => target.albumsUrl = url
    }

    const config = {};
    for (const entry of [sourceUrl, artistDetailsUrl, albumsUrl]) {
        const value = process.env[entry.evName];
        if(!value) {
            throw new Error(`Cannot create config from environment variable because the ${entry.name} could not be read from the environment variable ${entry.evName}`);
        } else {
            entry.setter(value, config);
        }
    }

    return config;
}

/**
 * Tries to get a value from the cli arguments. Tries to read a value from the environment
 * variables if there is none
 * @param {String} argumentName 
 * @param {String} environmentVariableName 
 * @returns {String|undefined} Contents of the argument/ev or `undefined` if nothing is found
 */
function getFromArgumentOrEnv(argumentName, environmentVariableName) {
    const parameter = `--${argumentName}=`;
    const fromArg = process.argv.find(arg => arg.startsWith(parameter));
    const formEnv = process.env[environmentVariableName];
    return fromArg ? fromArg.split('=')[1] : formEnv;
}

/**
 * Tries to read a GitHub access token from the command line arguments or the environment variables.
 * Cli arguments take precedence over environment variables
 */
function getAccessToken() {
    return getFromArgumentOrEnv('token', 'SPOTIFY_ALBUM_REPO_ACCESS_TOKEN');
}

/**
 * Checks the command line arguments for a config file. Returns a default value if none is found.
 * Defaults to `config.json`
 */
function getConfigFilename() {
    return getFromArgumentOrEnv('config', 'ALBUM_SHUFFLER_GENERATOR_CONFIG');
}

/**
 * @typedef {Object} Dimensions
 * @property {number} width
 * @property {number} height
 */

/**
 * Returns the dimensions of an image hosted on the web
 * @param {string} imageUrl
 * @return {Promise<Dimensions>}
 */
function getRemoteImageDimensions(imageUrl) {
    // Wrapping the Request in a promise so it's nicer to use in an async function
    const options = url.parse(imageUrl)
    return new Promise((resolve, reject) => {
        const req = https.get(options, (response) => {
            const chunks = [];
            const getImageSizeFromChunks = (chunks) => sizeOf(Buffer.concat(chunks));
            response.on('data', (chunk) => {
                chunks.push(chunk);
                const numberOfReceivedBytes = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                if(numberOfReceivedBytes >= NUMBER_OF_REQUIRED_BYTES_FOR_IMAGE_HEAD) {
                    console.log(`Got enough bytes (required >= ${NUMBER_OF_REQUIRED_BYTES_FOR_IMAGE_HEAD} got ${numberOfReceivedBytes}) to check the image header, ending request prematurely`)
                    response.destroy(); 
                    resolve(getImageSizeFromChunks(chunks));
                }
            });

            response.on('end', () => {
                console.log('Downloaded the entire image');
                resolve(getImageSizeFromChunks(chunks));
            });

            req.end();
        });
    });
}

async function sleep(milliSeconds) {
    return new Promise((resolve) =>setTimeout(resolve, milliSeconds));
}

/**
 * Downloads an image to check the image dimensions.
 * Tries a second and third time if the download fails.
 * Tries to parse the image dimensions from the image header.
 * Most images will not be downloaded completely
 * @param {String} imageUrl url of the image to get dimensions from
 * @returns 
 */
async function doubleRetryGetRemoteImageDimensions(imageUrl) {
    // This is not a good way to make things happen but it solved all problems =)
    try {
        return await getRemoteImageDimensions(imageUrl);
    } catch(error) {
        console.warn('Error on first attempt of retrieving remote image dimensions', error);
        try {
            await sleep(500);
            return await getRemoteImageDimensions(imageUrl);
        } catch(error) {
            console.warn('Error on second attempt of retrieving remote image dimensions', error);
            await sleep(500);
            console.log('Trying a final time');
            return await getRemoteImageDimensions(imageUrl);
        }
    }
}

/**
 * Downloads arbitrary json from a remote url
 * @param {String} url 
 * @param {Headers} authOptions 
 * @returns {Object} parsed object
 */
async function getJsonFromUrl(url, authOptions) {
    const res = await fetch(url, authOptions);
    if (!res.ok && res.status === 404) {
        throw new Error(`Encountered a 404 while accesing '${url}', did you supply a valid access token?`);
    } else if(!res.ok) {
        throw new Error(`Error accessing '${url}': ${res.status} ${res.statusText}`);
    }
    return res.json();
}

function getArtistSources(authOptions, url) {
    return getJsonFromUrl(url, authOptions);
}

/**
 * Gets the artist details from a remote url
 * @param {String} artistId 
 * @param {Headers} authOptions 
 * @param {String} url Url template to download artist details. Templates need to contain the string `"${artistId}"` 
 * that will be replaced with the given artist id
 * @returns 
 */
async function getArtistDetails(artistId, authOptions, url) {
    url = url.replace('${artistId}', artistId);
    const artistDetails = await getJsonFromUrl(url, authOptions);
    artistDetails.coverCenterX = artistDetails.coverCenterX ? artistDetails.coverCenterX : 50;
    artistDetails.coverCenterY = artistDetails.coverCenterY ? artistDetails.coverCenterY : 50;
    artistDetails.altCoverCenterX = artistDetails.altCoverCenterX ? 'Just ' + artistDetails.altCoverCenterX : 'Nothing';
    artistDetails.altCoverCenterY = artistDetails.altCoverCenterY ? 'Just ' + artistDetails.altCoverCenterY : 'Nothing';
    const updatedImagePromises = artistDetails.images.map(async image => {
        if(!image.width || !image.height) {
            console.log('Missing width/height data for artist', artistId)
            const dimensions = await doubleRetryGetRemoteImageDimensions(image.url)
            image.width = dimensions.width;
            image.height = dimensions.height;
        }
        return image;
    });
    const updatedImages = await Promise.all(updatedImagePromises);
    return artistDetails;
}

/**
 * Downloads album metadata for the given artist
 * @param {String} artistId 
 * @param {Headers} authOptions 
 * @param {String} url Url template to download the album data. Templates need to contain the string `"${artistId}"` 
 * that will be replaced with the given artist id
 * @returns {Array}
 */
function getAlbumsForArtist(artistId, authOptions, url) {
    url = url.replace('${artistId}', artistId);
    return getJsonFromUrl(url, authOptions);
}

function renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName) {
    const withConvertedCovers =
        albums.map(album => {
            album.firstImage = album.images[0]
            if (album.images.length > 1) {
                album.images.shift();
            }
            if (album.name.includes('\"')) {
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

/**
 * Gets the artist details and albm data for the given artist
 * @param {String} artistId 
 * @param {String} destinationFolder
 * @param {Headers} authOptions 
 * @param {String} artistDetailsUrl Url template to download the artist details. Templates need to contain the string `"${artistId}"` 
 * that will be replaced with the given artist id
 * @param {String} albumsUrl Url template to download the album data. Templates need to contain the string `"${artistId}"` 
 * that will be replaced with the given artist id
 */
async function handleArtist(artistId, destinationFolder, authOptions, artistDetailsUrl, albumsUrl) {
    const artistDetails = await getArtistDetails(artistId, authOptions, artistDetailsUrl);
    const albums = await getAlbumsForArtist(artistId, authOptions, albumsUrl);
    console.log('Found', albums.length, 'albums for', artistDetails.name);
    const moduleName = artistDetails.httpFriendlyShortName[0].toUpperCase() + artistDetails.httpFriendlyShortName.slice(1);
    const template = renderArtistAlbumStorageTemplate(artistDetails, albums, moduleName);
    writeTextToFile(template, path.join(destinationFolder, `AlbumStorage${moduleName}.elm`));
}

function getDestination() {
    const fromArgs = process.argv.slice(2).find(arg => arg.startsWith('--destination='));
    const fallback = 'output';
    const destination = fromArgs ? fromArgs.split('=')[1] : fallback;
    console.log(`Using destination: '${destination}'`);
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
        const configFilename = getConfigFilename();
        let config = null;
        if(configFilename) {
            console.log(`Using config file: ${configFilename}`);
            config = getConfigFromFile(configFilename);
        } else {
            console.log('No config file argument given, trying to create config from environment variables');
            config = getConfigFromEnvironment();
        }

        makeSureFolderExists(destination);
        const artistSources = await getArtistSources(authOptions, config.sourceUrl);
        const artistShortNames = artistSources.map(a => a.httpFriendlyShortName);
        throwIfThereAreDuplicates(artistShortNames);

        const artistIds = artistSources.map(a => a.id);
        console.log('Got artist ids', artistIds);
        for(const artistId of artistIds) {
            console.log('Handling artist', artistId);
            await handleArtist(artistId, destination, authOptions, config.artistDetailsUrl, config.albumsUrl);
        }
        
        const global = renderGlobalAlbumStorageTemplate(artistShortNames.map(n => n[0].toUpperCase() + n.slice(1)));
        writeTextToFile(global, path.join(destination, `ArtistsWithAlbums.elm`));
    } catch(err) {
        console.log('Could not get artist list because', err);
    }
})();
