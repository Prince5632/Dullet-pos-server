const nodemailer = require('nodemailer');
const { URL } = require('url');

const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
};

let transporterPromise;

const getTransporter = async () => {
  if (!transporterPromise) {
    if (!smtpConfig.host) {
      throw new Error('Mail configuration missing: SMTP_HOST');
    }
    transporterPromise = nodemailer.createTransport(smtpConfig);
  }
  return transporterPromise;
};

const resolveLoginUrl = () => {
  const baseUrl = process.env.CLIENT_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:5173';
  try {
    const url = new URL(baseUrl);
    url.pathname = '/login';
    return url.toString();
  } catch (err) {
    return 'http://localhost:5173/login';
  }
};

const sendNewUserCredentialsEmail = async ({
  recipientEmail,
  recipientName,
  temporaryPassword,
  createdByName
}) => {
  if (!recipientEmail || !temporaryPassword) {
    console.warn('Email payload missing required fields');
    return false;
  }

  // Check if SMTP is configured
  if (!smtpConfig.host) {
    console.warn('⚠️  SMTP not configured. Email not sent to:', recipientEmail);
    console.log('📧 User Credentials (email skipped):');
    console.log(`   Email: ${recipientEmail}`);
    console.log(`   Password: ${temporaryPassword}`);
    console.log('   Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to enable emails');
    return false;
  }

  try {
    const transporter = await getTransporter();
    const loginLink = resolveLoginUrl();
    const displayName = recipientName || recipientEmail;
    const createdByDisplay = createdByName ? ` by ${createdByName}` : '';

    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@dulletindustries.com',
      to: recipientEmail,
      subject: 'Your Dullet Industries POS account',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #1d4ed8;">Welcome to Dullet Industries POS</h2>
          <p>Hello ${displayName},</p>
          <p>An account has been created for you${createdByDisplay}. Use the credentials below to log in and update your password.</p>
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ccc;">Email</td>
              <td style="padding: 8px 12px; border: 1px solid #ccc;">${recipientEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #ccc;"> Password</td>
              <td style="padding: 8px 12px; border: 1px solid #ccc;">${temporaryPassword}</td>
            </tr>
          </table>
          <p>
            <a href="${loginLink}" style="display: inline-block; padding: 10px 18px; background-color: #1d4ed8; color: #fff; border-radius: 6px; text-decoration: none;">Login to Dullet POS</a>
          </p>
          <p style="margin-top: 16px;">Don not share this email with anyone.</p>
          <p>Regards,<br/>Dullet Industries Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent successfully to:', recipientEmail);
    return true;
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error.message);
    console.log('📧 User Credentials (email failed):');
    console.log(`   Email: ${recipientEmail}`);
    console.log(`   Password: ${temporaryPassword}`);
    return false;
  }
};

module.exports = {
  sendNewUserCredentialsEmail
};
