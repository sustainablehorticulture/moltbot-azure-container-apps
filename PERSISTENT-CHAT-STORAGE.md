# Persistent Chat Storage for Red Dog

Red Dog now includes persistent chat storage in Azure Blob Storage, allowing conversations to be remembered across sessions for each farm.

## Overview

Red Dog automatically saves conversation history to the `grassgumfarm` storage account, enabling:
- **Session continuity** - Resume conversations where you left off
- **Context retention** - Red Dog remembers previous discussions
- **Multi-farm support** - Separate chat histories for different farms
- **Automatic management** - Auto-save and cleanup of old sessions

## Storage Structure

### Container: `chat-history`

```
chat-history/
  ├── grassgum/              # Farm ID
  │   ├── user123/           # User ID
  │   │   ├── session-1234567890.json
  │   │   └── session-1234567891.json
  │   └── user456/
  │       └── session-1234567892.json
  └── pairtree/
      └── user789/
          └── session-1234567893.json
```

### Chat Session File Format

```json
{
  "farmId": "grassgum",
  "userId": "user123",
  "sessionId": "session-1234567890",
  "timestamp": "2026-03-06T02:50:00.000Z",
  "messageCount": 15,
  "messages": [
    {
      "role": "user",
      "content": "What's the soil moisture today?"
    },
    {
      "role": "assistant",
      "content": "Based on the latest sensor data..."
    }
  ],
  "metadata": {
    "model": "openai/gpt-4o-mini",
    "savedAt": "2026-03-06T02:50:00.000Z"
  }
}
```

## Configuration

### Environment Variables

```bash
# Farm identifier (default: grassgum)
FARM_ID=grassgum

# Enable/disable persistent chat (default: true)
PERSISTENT_CHAT_ENABLED=true

# Auto-save interval in messages (default: 5)
CHAT_AUTOSAVE_INTERVAL=5

# Max messages to keep in memory (default: 20)
CONVERSATION_HISTORY_LENGTH=20
```

### Azure Container App Configuration

These environment variables should be set in your Container App:

```bash
az containerapp update \
  --name clawdbot \
  --resource-group BotRedDog \
  --set-env-vars \
    FARM_ID=grassgum \
    PERSISTENT_CHAT_ENABLED=true \
    CHAT_AUTOSAVE_INTERVAL=5 \
    CONVERSATION_HISTORY_LENGTH=20
```

## How It Works

### 1. First Message
When a user sends their first message:
1. Red Dog checks if chat history exists for that user
2. Loads the most recent session (up to 20 messages)
3. Continues the conversation with full context

### 2. During Conversation
- Every 5 messages (configurable), Red Dog auto-saves to blob storage
- Messages are kept in memory for fast access
- Only the most recent N messages are retained (default: 20)

### 3. Session End
- When the conversation ends, final state is saved
- Old messages beyond the limit are trimmed
- Session metadata is preserved for tracking

### 4. Cleanup
- Old sessions (>90 days) can be automatically cleaned up
- Cleanup can be triggered manually or scheduled

## API Methods

### BlobStorageManager Methods

```javascript
// Save chat history
await blobStorage.saveChatHistory({
  farmId: 'grassgum',
  userId: 'user123',
  messages: [...],
  metadata: { sessionId: 'session-123' }
});

// Load chat history
const messages = await blobStorage.loadChatHistory({
  farmId: 'grassgum',
  userId: 'user123',
  maxMessages: 50
});

// List chat sessions
const sessions = await blobStorage.listChatSessions({
  farmId: 'grassgum',
  userId: 'user123'  // optional
});

// Cleanup old sessions
const deleted = await blobStorage.cleanupOldChatSessions({
  farmId: 'grassgum',
  daysToKeep: 90
});
```

### AIEngine Methods

```javascript
// Load history for user (automatic on first message)
await aiEngine.loadChatHistoryForUser('user123');

// Save history for user (automatic every N messages)
await aiEngine.saveChatHistoryForUser('user123');

// Clear history (saves before clearing)
await aiEngine.clearHistory('user123');
```

## Benefits

### For Users
- **Continuity** - Pick up conversations where you left off
- **Context** - Red Dog remembers what you discussed
- **No repetition** - Don't need to re-explain context

### For Farms
- **Audit trail** - Complete history of all interactions
- **Knowledge base** - Learn from past conversations
- **Compliance** - Retain records as needed

### For Operations
- **Automatic** - No manual intervention required
- **Scalable** - Blob storage handles any volume
- **Cost-effective** - Pay only for storage used
- **Reliable** - Azure Blob Storage SLA

## Multi-Farm Support

Different farms can have separate chat histories:

```bash
# Grassgum Farm
FARM_ID=grassgum

# Pairtree Farm
FARM_ID=pairtree

# Custom farm
FARM_ID=my-custom-farm
```

Each farm's conversations are isolated in separate blob paths.

## Monitoring

### Check Chat History Status

```javascript
const status = blobStorage.getStatus();
console.log(status);
// {
//   connected: true,
//   currentContainer: 'provider-data',
//   defaultContainer: 'provider-data',
//   cachedContainers: ['provider-data', 'chat-history'],
//   hasConnectionString: true
// }
```

### View Chat Sessions

```bash
# List all sessions for a farm
az storage blob list \
  --account-name grassgumfarm \
  --container-name chat-history \
  --prefix grassgum/ \
  --output table
```

### Download a Session

```bash
# Download specific session
az storage blob download \
  --account-name grassgumfarm \
  --container-name chat-history \
  --name grassgum/user123/session-1234567890.json \
  --file session.json
```

## Troubleshooting

### Chat History Not Loading

1. **Check blob storage connection**
   ```javascript
   console.log(blobStorage.isConnected);
   ```

2. **Verify container exists**
   ```bash
   az storage container show \
     --account-name grassgumfarm \
     --name chat-history
   ```

3. **Check environment variables**
   ```bash
   echo $PERSISTENT_CHAT_ENABLED
   echo $FARM_ID
   ```

### Auto-Save Not Working

1. **Check save interval**
   ```bash
   echo $CHAT_AUTOSAVE_INTERVAL
   ```

2. **Monitor logs**
   ```bash
   az containerapp logs show \
     --name clawdbot \
     --resource-group BotRedDog \
     --tail 50 | grep "Saved.*chat history"
   ```

### Storage Costs

Chat history storage is minimal:
- Average session: ~10KB
- 1000 sessions: ~10MB
- Monthly cost: < $0.01

## Security

- **Private containers** - No public access
- **Encrypted at rest** - Azure Blob Storage encryption
- **Access control** - Managed by storage account keys
- **Audit logs** - Azure Monitor integration

## Future Enhancements

Potential improvements:
- **Search across sessions** - Find specific conversations
- **Export to PDF** - Generate conversation reports
- **Analytics** - Track common questions and topics
- **Multi-user sessions** - Group conversations
- **Voice transcripts** - Store audio conversations

## Related Files

- `src/reddog/blob-storage.js` - Blob storage manager with chat methods
- `src/reddog/ai-engine.js` - AI engine with persistent chat integration
- `.env.example` - Configuration template
- `RED-DOG-CAPABILITIES.md` - Full capabilities overview
