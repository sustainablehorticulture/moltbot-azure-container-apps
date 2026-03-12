# Twilio Setup Guide for Agricultural Alert System

## 📱 Step 1: Create Twilio Account

1. **Go to**: https://www.twilio.com/try-twilio
2. **Sign up** for free trial account
3. **Verify your email** and phone number
4. **Choose**: "SMS" as your use case
5. **Select**: "Agricultural monitoring and alerts"

## 🔑 Step 2: Get Twilio Credentials

After signup, you'll get:

### **Account SID**
- Go to: https://console.twilio.com/
- Dashboard → Account Info → Account SID
- Example: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### **Auth Token**
- Dashboard → Account Info → Auth Token
- Click "Show" to reveal
- Example: `your_auth_token_here`

### **Twilio Phone Number**
- Dashboard → Phone Numbers → Buy a Number
- Choose a number with SMS capability
- Example: `+1234567890`

## ⚙️ Step 3: Configure Azure Function App

### **Add Environment Variables**
```bash
az functionapp config appsettings set \
  --resource-group AgenticAG \
  --name backendalerts-e9c2gdf3ejdzdgfp \
  --settings \
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=your_auth_token_here \
  TWILIO_PHONE_NUMBER=+1234567890 \
  SMS_PROVIDER=twilio
```

### **Or Add via Azure Portal**
1. Go to: `backendalerts-e9c2gdf3ejdzdgfp` Function App
2. Settings → Configuration → Application settings
3. Add these settings:
   - Name: `TWILIO_ACCOUNT_SID`, Value: `ACxxxxxxxx...`
   - Name: `TWILIO_AUTH_TOKEN`, Value: `your_auth_token`
   - Name: `TWILIO_PHONE_NUMBER`, Value: `+1234567890`
   - Name: `SMS_PROVIDER`, Value: `twilio`

## 🧪 Step 4: Test Twilio Integration

### **Test SMS via Alert Function**
```bash
curl -X POST "https://backendalerts-e9c2gdf3ejdzdgfp.australiasoutheast-01.azurewebsites.net/api/alerts/send" \
  -H "Content-Type: application/json" \
  -H "x-functions-key: YOUR_ALERT_FUNCTION_KEY" \
  -H "x-site-id: grassgumfarm" \
  -d '{
    "type": "sms",
    "recipients": [{"phone": "+1234567890"}],
    "message": "Test alert: High temperature detected in greenhouse A1"
  }'
```

### **Expected Response**
```json
{
  "success": true,
  "siteId": "grassgumfarm",
  "type": "sms",
  "sent": 1,
  "failed": 0,
  "results": [
    {
      "success": true,
      "provider": "twilio",
      "messageId": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "to": "+1234567890",
      "from": "+1234567890"
    }
  ]
}
```

## 🚨 Step 5: Alert System Integration

### **Automatic SMS Alerts**
Your alert system will now automatically send SMS when:
- Temperature exceeds threshold
- Humidity is too high/low
- Soil moisture is critical
- Device goes offline

### **Alert Message Format**
```
🚨 ALERT: High Temperature
Site: grassgumfarm
Sensor: IR1OT
Value: 42°C
Threshold: 35°C
Time: 2026-03-11 15:30:00
Action: Check cooling system immediately
```

## 📋 Step 6: Verify Setup

### **Check Twilio Usage**
1. Go to: https://console.twilio.com/
2. Dashboard → Usage
3. Verify SMS messages are being sent
4. Check delivery status

### **Check Azure Logs**
1. Go to: Azure Portal → Function App
2. Monitor → Logs
3. Look for successful SMS send operations

## 🔧 Troubleshooting

### **Common Issues**

#### **"Account SID is invalid"**
- Check your Account SID format (starts with "AC")
- Ensure no extra spaces or characters

#### **"Auth Token is invalid"**
- Verify Auth Token is correct
- Regenerate if needed from Twilio console

#### **"Phone number is not SMS-enabled"**
- Ensure your Twilio number has SMS capability
- Check number configuration in Twilio console

#### **"No recipients specified"**
- Verify recipient phone number format (+countrycode)
- Check JSON format in API call

### **Debug Steps**
1. Check Azure Function App logs
2. Verify Twilio account balance
3. Test with simple message first
4. Check phone number format

## 💰 Cost Considerations

### **Twilio Free Trial**
- $15.50 USD free credit
- ~$0.0079 per SMS message
- Good for testing and initial setup

### **Production Costs**
- SMS: ~$0.0079 per message
- Phone number: $1.00/month
- Scale with number of alerts

## 🎯 Best Practices

### **Phone Number Format**
- Always use E.164 format: `+1234567890`
- Include country code for international numbers

### **Message Content**
- Keep messages under 160 characters (SMS limit)
- Include site ID and alert type
- Add actionable information

### **Rate Limiting**
- Don't send more than 1 SMS per minute per site
- Implement cooldown periods
- Group related alerts

## ✅ Setup Checklist

- [ ] Create Twilio account
- [ ] Get Account SID, Auth Token, Phone Number
- [ ] Configure Azure Function App settings
- [ ] Test SMS sending
- [ ] Verify alert integration
- [ ] Monitor Twilio usage
- [ ] Set up cost monitoring

Your agricultural alert system is now ready to send SMS notifications! 📱🚜
