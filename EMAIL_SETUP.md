# Email Configuration Setup

## Overview
The system sends welcome emails with credentials to newly created users. Email functionality requires SMTP configuration.

## Required Environment Variables

Add these to your `.env` file in the `dullet-api` directory:

```env
# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=noreply@dulletindustries.com

# Client URL (for login link in emails)
CLIENT_BASE_URL=http://localhost:5173
```

## Gmail Setup (Recommended for Testing)

If using Gmail:

1. **Create an App Password:**
   - Go to your Google Account settings
   - Enable 2-Factor Authentication
   - Go to Security → App Passwords
   - Generate a new app password for "Mail"
   - Use this password in `SMTP_PASS`

2. **Configuration:**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your-gmail-address@gmail.com
   SMTP_PASS=your-16-character-app-password
   ```

## Other SMTP Providers

### Outlook/Office365
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
```

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### AWS SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
```

## Testing Email Configuration

After setting up, check the server console when creating a user:
- ✅ `Welcome email sent successfully to: user@example.com` = Email sent
- ⚠️ `SMTP not configured` = Missing SMTP settings
- ❌ `Failed to send welcome email` = Check credentials/settings

## Troubleshooting

### Email Not Sending
1. Check `.env` file has all required SMTP variables
2. Verify SMTP credentials are correct
3. Check server console for error messages
4. Test SMTP connection separately

### Gmail "Less Secure Apps" Error
- Don't use your actual password
- Use an App Password instead (requires 2FA)

### Firewall Issues
- Ensure port 587 (or 465 for secure) is not blocked
- Check your hosting provider's firewall rules

## Credentials Console Logging

When email fails or SMTP is not configured, credentials will be logged to the console:
```
📧 User Credentials (email skipped):
   Email: user@example.com
   Password: tempPassword123
```

You can manually share these with the user if email is not set up.





