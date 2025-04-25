import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from 'axios';
import { z } from "zod";
import * as cheerio from 'cheerio';
const BASE_URL = "https://collections.louvre.fr";
const API_URL = `ark:/53355`;
const USER_AGENT = "louvremcp-app/1.0";
// Create server instance
const server = new McpServer({
    name: "louvreMCP",
    version: "1.0.0",
});
/**
 * Helper function to make API requests
 */
async function fetchLouvreAPI(path, params = {}) {
    const url = new URL(path, BASE_URL);
    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.append(key, String(value));
        }
    });
    // Append .json to get JSON response if needed
    if (!url.pathname.endsWith('.json') && !url.pathname.includes('.json?')) {
        url.pathname += '.json';
    }
    try {
        const response = await axios.get(url.toString());
        const data = response.data;
        // Ensure all URLs in image data are prefixed with the base URL
        if (data.image) {
            data.image = data.image.map((img) => ({
                ...img,
                urlImage: img.urlImage.startsWith("https://collections.louvre.fr/")
                    ? img.urlImage
                    : `https://collections.louvre.fr/${img.urlImage}`,
                urlThumbnail: img.urlThumbnail.startsWith("https://collections.louvre.fr/")
                    ? img.urlThumbnail
                    : `https://collections.louvre.fr/${img.urlThumbnail}`,
            }));
        }
        return data;
    }
    catch (error) {
        console.error('Error fetching from Louvre API:', error);
        throw error;
    }
}
server.tool("get-artwork-detail", "get details for an artwork in the Louvre", {
    id: z.string().describe("The ID of the artwork")
}, async ({ id }) => {
    const response = await fetchLouvreAPI(`/${API_URL}/${id}`);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    id: response.id,
                    title: response.title,
                    artist: response.creator,
                    date: response.dateCreated,
                    medium: response.medium,
                    dimensions: response.dimension,
                    location: response.currentLocation || "Unknown", // Add location if available
                    acquisition: response.acquisitionDetails || "Unknown", // Add acquisition info if available
                    description: response.description,
                    imageData: response.image,
                    url: response.url
                }),
            },
        ],
    };
});
server.tool("get-artwork-images", "get images for an artwork in the Louvre", {
    id: z.string().describe("The ID of the artwork"),
    type: z.enum(["thumbnail", "full", "all"]).optional().describe("The type of image to retrieve"),
    position: z.number().optional().describe("The position of the image to retrieve")
}, async ({ id, type, position }) => {
    const artworkDetails = await fetchLouvreAPI(`/${API_URL}/${id}`);
    if (!artworkDetails.image || artworkDetails.image.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to find images for the artwork with ID ${id}`,
                },
            ],
        };
    }
    // If a specific position is requested, return just that image
    if (position !== undefined) {
        const positionNum = Number(position);
        const specificImage = artworkDetails.image.find((img) => img.position === positionNum);
        if (!specificImage) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to find image at position ${positionNum} for the artwork with ID ${id}`,
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Here is the ${type} image at position ${positionNum} for the artwork with ID ${id}: ${specificImage.urlImage}`
                },
            ],
        };
    }
    // Group images by type
    const imagesByType = {};
    // Process all images and group them by type
    artworkDetails.image.forEach((img) => {
        const imageType = img.type || 'unspecified';
        if (!imagesByType[imageType]) {
            imagesByType[imageType] = [];
        }
        imagesByType[imageType].push(img);
    });
    // Get available image types
    const availableTypes = Object.keys(imagesByType);
    let imageDetails = '';
    Object.entries(imagesByType).forEach(([imageType, images]) => {
        images.forEach((img) => {
            imageDetailsSelected += `Type: ${imageType}, URL: ${img.urlImage}\n`;
        });
    });
    // If type is 'all', return all images
    if (type === 'all' || !type) {
        return {
            content: [
                {
                    type: "text",
                    text: `Here are the images for the artwork with ID ${id}:\n${imageDetails}`
                },
            ],
        };
    }
    // If requested type doesn't exist, use the first available type
    const selectedType = availableTypes.includes(type)
        ? type
        : availableTypes[0] || 'unspecified';
    // Get images of the selected type
    const selectedImages = imagesByType[selectedType] || [];
    // Sort images by position
    selectedImages.sort((a, b) => a.position - b.position);
    let imageDetailsSelected = '';
    Object.entries(imagesByType).forEach(([imageType, images]) => {
        images.forEach((img) => {
            imageDetails += `Type: ${imageType}, URL: ${img.urlImage}\n`;
        });
    });
    return {
        content: [
            {
                type: "text",
                text: `Here are the images for the artwork with ID ${id} and type ${type}:\n${imageDetailsSelected}`
            },
        ],
    };
});
server.tool("search-artwork", "search for an artwork in the Louvre", {
    query: z.string().describe("What do you want to search for?"),
    page: z.number().optional().describe("The page number of the search results"),
}, async ({ query, page }) => {
    if (!query) {
        return {
            content: [
                {
                    type: "text",
                    text: `Please provide a search query to find artwork in the Louvre`,
                },
            ],
        };
    }
    // Format the query for URL
    const formattedQuery = encodeURIComponent(query);
    const searchUrl = `https://collections.louvre.fr/recherche?page=${page}&q=${formattedQuery}`;
    // Fetch the search results page
    const response = await axios.get(searchUrl);
    const html = response.data;
    // Use cheerio to parse the HTML
    const $ = cheerio.load(html);
    // Extract artwork information from the search results
    const artworks = [];
    // Find all artwork cards
    $('#search__grid .card__outer').each((index, element) => {
        // Extract the URL and ID
        const linkElement = $(element).find('a').first();
        const url = linkElement.attr('href');
        const id = url ? url.split('/').pop() : '';
        // Extract the image information
        const imgElement = $(element).find('img');
        const imageUrl = imgElement.attr('data-src') || '';
        const fullTitle = imgElement.attr('title') || '';
        // Extract the title and author
        const titleElement = $(element).find('.card__title a');
        const title = titleElement.text().trim();
        const authorElement = $(element).find('.card__author');
        const author = { label: authorElement.text().trim(), attributionLevel: "artist", linkType: "", dates: [], creatorRole: "", authenticationType: "", doubt: "", attributedBy: "", attributedYear: "", wikidata: "" };
        const currentArtwork = {
            arkId: id || '', // Assuming 'id' is equivalent to 'ark', defaulting to an empty string if undefined
            title: title,
            creator: [author], // Map 'author' to 'artist'
            dateCreated: [], // Add a placeholder or extract if available
            dimension: [], // Add a placeholder or extract if available
            image: imageUrl
                ? [
                    {
                        copyright: "",
                        position: 0,
                        type: 'face, recto, avers, avant',
                        urlImage: imageUrl.startsWith("https://collections.louvre.fr/")
                            ? imageUrl
                            : `https://collections.louvre.fr/${imageUrl}`,
                        urlThumbnail: imageUrl.startsWith("https://collections.louvre.fr/")
                            ? imageUrl
                            : `https://collections.louvre.fr/${imageUrl}`,
                    },
                ]
                : [],
            url: url ? `https://collections.louvre.fr${url}` : '',
            displayDateCreated: "", // Add a placeholder or extract if available
            currentLocation: "", // Add a placeholder or extract if available
            room: "", // Add a placeholder or extract if available
            inscriptions: "", // Add a placeholder or extract if available
            objectHistory: "", // Add a placeholder or extract if available
            acquisitionDetails: [], // Add a placeholder or extract if available
            ownedBy: "", // Add a placeholder or extract if available
            id: undefined, // Add a placeholder or extract if available
            medium: "", // Add a placeholder or extract if available
            description: fullTitle || '', // Add a placeholder or extract if available
        };
        // Add the artwork to the results
        artworks.push(currentArtwork);
    });
    // Get pagination information
    const totalResultsText = $('.search__results__count').text().trim().split(' ')[0] || '0';
    const totalResults = parseInt(totalResultsText.replace(/\D/g, ''));
    const totalPages = Math.ceil(totalResults / 20);
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ artworks }),
            },
        ],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Louvre MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
