# Red Dog Social Media Integration

Red Dog can now connect to and automate posting on Instagram, Facebook (including Ads Manager), and LinkedIn.

## Features

### Supported Platforms
- **Instagram** - Post images with captions via Facebook Graph API
- **Facebook** - Post updates, links, and images to pages
- **Facebook Ads Manager** - Create and manage ad campaigns
- **LinkedIn** - Post updates to your professional network

### Capabilities
- OAuth2 authentication for secure access
- Automated posting to multiple platforms
- Ad campaign creation (Facebook)
- Token management and refresh
- Post history tracking

## Setup

### 1. Create Developer Apps

#### Instagram & Facebook
1. Go to [Facebook Developers](https://developers.facebook.com/apps/)
2. Create a new app or use an existing one
3. Add **Instagram Basic Display** and **Instagram Graph API** products
4. Configure OAuth redirect URIs:
   - Add: `https://your-app-url.azurecontainerapps.io/api/social/auth/callback`
5. Get your App ID and App Secret from Settings > Basic

#### LinkedIn
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Create a new app
3. Add OAuth 2.0 redirect URLs:
   - Add: `https://your-app-url.azurecontainerapps.io/api/social/auth/callback`
4. Request access to the following products:
   - Share on LinkedIn
   - Sign In with LinkedIn
5. Get your Client ID and Client Secret from Auth tab

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Instagram (via Facebook Graph API)
INSTAGRAM_CLIENT_ID=your_instagram_app_id
INSTAGRAM_CLIENT_SECRET=your_instagram_app_secret

# Facebook & Facebook Ads Manager
FACEBOOK_CLIENT_ID=your_facebook_app_id
FACEBOOK_CLIENT_SECRET=your_facebook_app_secret
FACEBOOK_AD_ACCOUNT_ID=act_1234567890  # Optional, for ads

# LinkedIn
LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret

# OAuth redirect URI
OAUTH_REDIRECT_URI=https://your-app-url.azurecontainerapps.io/api/social/auth/callback
```

### 3. Create Database Tables

Run the SQL schema to create required tables:

```bash
sqlcmd -S your-server.database.windows.net -U your-username -P your-password -d zerosumag -i database/social-media-schema.sql
```

Or manually execute the SQL in `database/social-media-schema.sql`.

## Usage

### Authentication

#### 1. Get Authorization URL

```bash
GET /api/social/auth/:platform?userId=user123
```

Platforms: `instagram`, `facebook`, `linkedin`

**Response:**
```json
{
  "authUrl": "https://...",
  "platform": "instagram",
  "message": "Please visit this URL to authenticate with instagram"
}
```

#### 2. User Visits URL and Authorizes

The user will be redirected to the platform's authorization page, where they grant permissions.

#### 3. Callback Handles Token Exchange

After authorization, the platform redirects to:
```
/api/social/auth/callback?code=...&state=...&platform=instagram&userId=user123
```

Red Dog automatically exchanges the code for access tokens and stores them securely.

#### 4. Check Authentication Status

```bash
GET /api/social/status?userId=user123
```

**Response:**
```json
{
  "instagram": {
    "authenticated": true,
    "expires": "2026-04-08T12:00:00Z"
  },
  "facebook": {
    "authenticated": true,
    "expires": "2026-04-08T12:00:00Z"
  },
  "linkedin": {
    "authenticated": false,
    "expires": null
  }
}
```

### Posting to Instagram

```bash
POST /api/social/instagram/post
Content-Type: application/json

{
  "userId": "user123",
  "caption": "Check out our latest farm update! 🌾 #AgTech #SustainableFarming",
  "imageUrl": "https://example.com/farm-photo.jpg",
  "mediaType": "IMAGE"
}
```

**Response:**
```json
{
  "success": true,
  "platform": "instagram",
  "postId": "17895695668004550",
  "message": "Posted to Instagram successfully!"
}
```

### Posting to Facebook

```bash
POST /api/social/facebook/post
Content-Type: application/json

{
  "userId": "user123",
  "message": "Exciting news from the farm! Our new irrigation system is now live.",
  "link": "https://grassgumfarm.com/blog/new-irrigation",
  "imageUrl": "https://example.com/irrigation.jpg",
  "pageId": "123456789"  // Optional, for page posts
}
```

**Response:**
```json
{
  "success": true,
  "platform": "facebook",
  "postId": "123456789_987654321",
  "message": "Posted to Facebook successfully!"
}
```

### Creating Facebook Ads

```bash
POST /api/social/facebook/ad
Content-Type: application/json

{
  "userId": "user123",
  "campaignName": "Spring Harvest Promotion",
  "adSetName": "Local Farmers",
  "adName": "Fresh Produce Ad",
  "targeting": {
    "age_min": 25,
    "age_max": 65,
    "geo_locations": {
      "countries": ["AU"]
    }
  },
  "creative": {
    "image_url": "https://example.com/ad-image.jpg",
    "body": "Fresh produce from Grassgum Farm"
  },
  "budget": {
    "daily_budget": 5000  // in cents
  }
}
```

**Response:**
```json
{
  "success": true,
  "platform": "facebook_ads",
  "campaignId": "120210000000000",
  "message": "Facebook ad campaign created successfully!"
}
```

### Posting to LinkedIn

```bash
POST /api/social/linkedin/post
Content-Type: application/json

{
  "userId": "user123",
  "text": "Proud to announce our farm's sustainability milestone! We've reduced water usage by 30% this year through smart irrigation technology. #AgTech #Sustainability",
  "link": "https://grassgumfarm.com/sustainability-report",
  "imageUrl": "https://example.com/sustainability.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "platform": "linkedin",
  "postId": "urn:li:share:1234567890",
  "message": "Posted to LinkedIn successfully!"
}
```

### Disconnecting a Platform

```bash
DELETE /api/social/auth/:platform?userId=user123
```

**Response:**
```json
{
  "success": true,
  "message": "Disconnected from instagram"
}
```

## Future Automation Features

Red Dog will be able to:

1. **Scheduled Posts** - Queue posts for future publishing
2. **AI-Generated Content** - Create post captions based on farm data
3. **Cross-Platform Publishing** - Post to multiple platforms simultaneously
4. **Analytics Integration** - Track engagement and performance
5. **Smart Hashtags** - Suggest relevant hashtags based on content
6. **Image Optimization** - Resize and optimize images for each platform
7. **Campaign Management** - Full Facebook Ads campaign lifecycle
8. **Content Calendar** - Visual planning and scheduling interface

## Security

- OAuth tokens are encrypted and stored securely in the database
- State tokens prevent CSRF attacks
- Tokens are automatically refreshed before expiration
- All API calls require user authentication
- Sensitive credentials are never logged or exposed

## Troubleshooting

### "Not authenticated" error
- Check that you've completed the OAuth flow for the platform
- Verify tokens haven't expired by checking `/api/social/status`
- Re-authenticate if needed

### "Invalid OAuth state token" error
- State tokens expire after 10 minutes
- Start the OAuth flow again from step 1

### Facebook/Instagram API errors
- Ensure your app has the required permissions
- Check that your app is in "Live" mode (not Development)
- Verify your Facebook page is connected to your Instagram account

### LinkedIn API errors
- Ensure you've requested and been granted access to required products
- Check that your app is verified if posting to organization pages

## Database Schema

The integration uses three tables in the `reddog` schema:

- **OAuthStates** - Temporary state tokens for CSRF protection
- **SocialMediaTokens** - Encrypted access and refresh tokens
- **SocialMediaPosts** - Post history and scheduling

See `database/social-media-schema.sql` for full schema details.

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/social/auth/:platform` | Get OAuth authorization URL |
| GET | `/api/social/auth/callback` | OAuth callback handler |
| GET | `/api/social/status` | Get authentication status |
| DELETE | `/api/social/auth/:platform` | Disconnect platform |

### Posting Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/social/instagram/post` | Post to Instagram |
| POST | `/api/social/facebook/post` | Post to Facebook |
| POST | `/api/social/facebook/ad` | Create Facebook ad |
| POST | `/api/social/linkedin/post` | Post to LinkedIn |

## Support

For issues or questions:
1. Check the [Facebook Graph API documentation](https://developers.facebook.com/docs/graph-api)
2. Check the [LinkedIn API documentation](https://docs.microsoft.com/en-us/linkedin/)
3. Review Red Dog logs for detailed error messages
4. Contact your system administrator

---

**Note:** This is a powerful feature that requires careful configuration. Always test in development mode before using in production.
