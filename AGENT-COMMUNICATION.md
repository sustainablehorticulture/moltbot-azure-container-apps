# Red Dog Agent Communication

Red Dog can now communicate with Trevor Tractor and Daisy Bell via Azure Service Bus, enabling seamless inter-agent messaging and collaboration.

## Overview

When you mention `@trevor` or `@daisy bell` in a Discord message to Red Dog, the message is automatically routed to the mentioned agent(s) via Service Bus. The agents can respond, and Red Dog will relay their replies back to Discord.

## How It Works

### 1. @Mention Detection

Red Dog detects mentions of other agents in Discord messages:
- `@trevor` or `@trevor tractor` → Routes to Trevor Tractor
- `@daisy` or `@daisy bell` or `@daisybell` → Routes to Daisy Bell

### 2. Message Routing

When an agent is mentioned:
1. Red Dog sends the message to the agent via Service Bus
2. Red Dog acknowledges the routing in Discord
3. The message is queued with a 30-second timeout

### 3. Response Handling

When an agent replies:
1. Red Dog receives the reply via Service Bus
2. Red Dog relays the reply to the Discord channel
3. The conversation continues naturally

## Usage Examples

### Asking Trevor for Data

```
@red dog can you ask @trevor to get the latest soil moisture data?
```

**Red Dog responds:**
```
📨 Right-o! I've sent that message to Trevor Tractor. They'll get back to ya soon, mate!
```

**Trevor replies (via Service Bus, relayed by Red Dog):**
```
**Trevor Tractor**: G'day! I've fetched the soil moisture data from the sensors. 
It's ready for approval in Red Dog's queue.
```

### Coordinating with Daisy Bell

```
@red dog tell @daisy bell we need a weather forecast for the next week
```

**Red Dog responds:**
```
📨 Right-o! I've sent that message to Daisy Bell. They'll get back to ya soon, mate!
```

**Daisy Bell replies:**
```
**Daisy Bell**: Hello! I've pulled the 7-day forecast. Looks like rain on Thursday 
and Friday, perfect for the new plantings!
```

### Multi-Agent Coordination

```
@red dog ask @trevor and @daisy bell to coordinate on irrigation scheduling
```

Red Dog routes the message to both agents and relays their responses as they come in.

## Service Bus Message Format

### Agent Message (Red Dog → Trevor/Daisy)

```json
{
  "messageType": "agent-message",
  "body": {
    "messageId": "reddog-1234567890-abc123",
    "from": "red-dog",
    "to": "trevor-tractor",
    "message": "Can you get the latest soil moisture data?",
    "context": {
      "userId": "discord-user-id",
      "channelId": "discord-channel-id",
      "platform": "discord",
      "fromAgent": "red-dog"
    },
    "conversationId": "discord-message-id",
    "timestamp": "2026-03-08T05:15:00Z"
  },
  "applicationProperties": {
    "messageType": "agent-message",
    "sender": "red-dog",
    "timestamp": "2026-03-08T05:15:00Z"
  }
}
```

### Agent Reply (Trevor/Daisy → Red Dog)

```json
{
  "messageType": "agent-reply",
  "body": {
    "replyToMessageId": "reddog-1234567890-abc123",
    "from": "trevor-tractor",
    "to": "red-dog",
    "reply": "G'day! I've fetched the soil moisture data.",
    "conversationId": "discord-message-id",
    "timestamp": "2026-03-08T05:15:05Z"
  },
  "applicationProperties": {
    "messageType": "agent-reply",
    "sender": "trevor-tractor",
    "timestamp": "2026-03-08T05:15:05Z"
  }
}
```

## Architecture

### Components

1. **AgentCommunicationManager** (`src/reddog/agent-communication.js`)
   - Detects @mentions in messages
   - Routes messages to agents via Service Bus
   - Handles incoming messages and replies
   - Manages timeouts and pending requests

2. **ServiceBusManager** (`src/reddog/service-bus-client.js`)
   - Extended with `sendToAgent()` and `replyToAgent()` methods
   - Handles message serialization and delivery
   - Manages Service Bus connection

3. **DiscordClient** (`src/reddog/discord-client.js`)
   - Integrated with AgentCommunicationManager
   - Detects @mentions before processing messages
   - Relays agent replies back to Discord

### Message Flow

```
Discord User → Red Dog (Discord)
              ↓
        @mention detection
              ↓
    Service Bus (agent-message)
              ↓
        Trevor/Daisy Bell
              ↓
    Service Bus (agent-reply)
              ↓
        Red Dog (Discord)
              ↓
        Discord Channel
```

## Configuration

No additional configuration required! Agent communication is automatically enabled when:
- Service Bus is connected (`SERVICE_BUS_CONNECTION_STRING` is set)
- Discord is connected (`DISCORD_BOT_TOKEN` is set)

## Timeouts

- **Response Timeout**: 30 seconds
- If an agent doesn't respond within 30 seconds, Red Dog notifies the Discord channel:
  ```
  ⏱️ Trevor Tractor didn't respond in time, mate. They might be busy out in the paddock.
  ```

## Programmatic Usage

You can also send messages to agents programmatically (not from Discord):

```javascript
// Send a direct message to Trevor
await agentComm.sendDirectMessage({
    agent: 'trevor-tractor',
    message: 'Request soil moisture data',
    context: { source: 'automated-task' }
});

// Broadcast to all agents
await agentComm.broadcastToAgents({
    message: 'System maintenance in 10 minutes',
    context: { priority: 'high' }
});
```

## Status Monitoring

Check agent communication status:

```javascript
const status = agentComm.getStatus();
console.log(status);
// {
//   pendingRequests: 2,
//   serviceBusConnected: true,
//   discordConnected: true,
//   supportedAgents: ['trevor', 'trevor tractor', 'daisy', 'daisy bell', 'daisybell']
// }
```

## Supported Agents

| Agent | Aliases | Service Bus ID |
|-------|---------|----------------|
| Trevor Tractor | `@trevor`, `@trevor tractor` | `trevor-tractor` |
| Daisy Bell | `@daisy`, `@daisy bell`, `@daisybell` | `daisy-bell` |

## Implementation in Trevor and Daisy Bell

For Trevor and Daisy Bell to receive and respond to messages from Red Dog, they need to:

1. **Listen for `agent-message` events:**
   ```javascript
   serviceBus.onMessage('agent-message', async (data) => {
       if (data.to === 'trevor-tractor') {
           // Process message
           const response = await processMessage(data.message);
           
           // Send reply
           await serviceBus.replyToAgent({
               messageId: data.messageId,
               agent: data.from,
               reply: response,
               conversationId: data.conversationId
           });
       }
   });
   ```

2. **Implement `replyToAgent()` method:**
   ```javascript
   async replyToAgent({ messageId, agent, reply, conversationId }) {
       return await this.sendMessage('agent-reply', {
           replyToMessageId: messageId,
           from: 'trevor-tractor', // or 'daisy-bell'
           to: agent,
           reply,
           conversationId,
           timestamp: new Date().toISOString()
       });
   }
   ```

## Benefits

1. **Seamless Collaboration** - Agents can work together without manual intervention
2. **Natural Conversation** - @mentions work just like Discord user mentions
3. **Async Communication** - Agents respond when ready, no blocking
4. **Timeout Protection** - Users are notified if an agent is unavailable
5. **Context Preservation** - Conversation IDs maintain message threads

## Future Enhancements

- **Group Conversations** - Multi-agent discussions with threading
- **Message History** - Store and retrieve past agent conversations
- **Priority Queues** - Urgent messages get faster responses
- **Agent Status** - Check if agents are online before routing
- **Smart Routing** - AI determines which agent to route to based on message content
- **Acknowledgments** - Agents confirm receipt before processing

## Troubleshooting

### Messages not routing to agents

1. Check Service Bus connection:
   ```
   Service Bus: agri-events
   ```

2. Verify agent names are spelled correctly:
   - ✅ `@trevor` or `@trevor tractor`
   - ✅ `@daisy bell` or `@daisy`
   - ❌ `@trevor-tractor` (use space, not hyphen)

### Timeout messages appearing

- Agents may be offline or busy
- Check agent logs to see if they received the message
- Verify Service Bus subscription names match

### Replies not appearing in Discord

- Check Discord client is connected
- Verify channel permissions
- Check Red Dog logs for relay errors

## Security

- Messages are only routed to known agents (Trevor, Daisy Bell)
- Discord user permissions are preserved
- Service Bus messages are encrypted in transit
- Conversation IDs prevent message spoofing

---

**Note:** This feature requires all agents (Red Dog, Trevor, Daisy Bell) to be connected to the same Azure Service Bus topic (`agri-events`) with appropriate subscriptions.
