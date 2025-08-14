import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  // We'll allow boot without SMTP to not crash dev, but log a warning
  // eslint-disable-next-line no-console
  console.warn('SMTP env vars missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM');
}

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: Number(SMTP_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendOrderReceivedEmail(to, { orderId, shopName, items, status, fromEmail, fromName, distributorName, distributorEmail }) {
  let subject, text, html, from;
  
  const productLines = items.map((item, idx) => `${idx + 1}. ${item.name} x${item.qty} (Rs${item.price})`).join('\n');
  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.price), 0).toFixed(2);
  
  // Set the 'from' field based on who's sending the email
  from = fromEmail ? `"${fromName || 'Orderly'}" <${fromEmail}>` : process.env.SMTP_FROM;
  
  if (status === 'new_order') {
    // Email template for new order notification to distributor
    subject = `🛒 New Order Received - ${orderId}`;
    text = `You have received a new order from ${shopName || 'a shop'}!\n\nOrder ID: ${orderId}\nShop: ${shopName}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}\n\nPlease log in to your distributor dashboard to review and accept the order.`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #1e40af; margin: 0;">🛒 New Order Received</h1>
          <p style="color: #4b5563; margin: 5px 0 0;">Order #${orderId}</p>
        </div>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 5px 0;"><strong>Shop:</strong> ${shopName || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin: 5px 0;"><strong>Total Amount:</strong> Rs${totalAmount}</p>
        </div>
        
        <h3 style="color: #1e40af; margin-bottom: 10px;">Order Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Product</th>
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">Qty</th>
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">Price</th>
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">${item.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">${item.qty}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">Rs${item.price}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">Rs${(item.qty * item.price).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align: right; padding: 10px; font-weight: bold;">Total:</td>
              <td style="text-align: right; padding: 10px; font-weight: bold;">Rs${totalAmount}</td>
            </tr>
          </tfoot>
        </table>
        
        <div style="text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
          <a href="${process.env.FRONTEND_URL || 'https://your-orderly-app.com'}/wholesale/orders" 
             style="display: inline-block; background-color: #1e40af; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; font-weight: 500;">
            View & Accept Order
          </a>
          <p style="margin-top: 15px; font-size: 13px; color: #64748b;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    `;
  } else if (status === 'placed') {
    subject = `✅ Order Confirmed & Placed - ${orderId}`;
    text = `Great news! Your order has been confirmed and placed by the distributor.\n\nOrder ID: ${orderId}\nShop: ${shopName}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}\n\nYour order is now being prepared for delivery. You will receive another notification when it's out for delivery.`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #16a34a;">✅ Order Confirmed & Placed</h2>
        <p>Great news! Your order has been <strong>confirmed and placed</strong> by the distributor.</p>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Shop:</strong> ${shopName}</p>
          <p><strong>Total Amount:</strong> Rs${totalAmount}</p>
        </div>
        
        <h3>Products:</h3>
        <ul style="background: #f1f5f9; padding: 15px; border-radius: 6px;">
          ${items.map(item => `<li>${item.name} x${item.qty} - Rs${(item.qty * item.price).toFixed(2)}</li>`).join('')}
        </ul>
        
        <p style="color: #059669; font-weight: bold;">📦 Your order is now being prepared for delivery.</p>
        <p>You will receive another notification when it's out for delivery.</p>
      </div>
    `;
  } else if (status === 'out_for_delivery') {
    subject = `🚚 Order Out for Delivery - ${orderId}`;
    text = `Your order is now out for delivery!\n\nOrder ID: ${orderId}\nShop: ${shopName}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}\n\nExpected delivery: Today or within 1-2 business days. Please keep your shop open to receive the delivery.`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #ea580c;">🚚 Order Out for Delivery</h2>
        <p>Your order is now <strong>out for delivery</strong>!</p>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Shop:</strong> ${shopName}</p>
          <p><strong>Total Amount:</strong> Rs${totalAmount}</p>
        </div>
        
        <h3>Products:</h3>
        <ul style="background: #f1f5f9; padding: 15px; border-radius: 6px;">
          ${items.map(item => `<li>${item.name} x${item.qty} - Rs${(item.qty * item.price).toFixed(2)}</li>`).join('')}
        </ul>
        
        <p style="color: #ea580c; font-weight: bold;">📍 Expected delivery: Today or within 1-2 business days</p>
        <p>Please keep your shop open to receive the delivery. Contact us if you have any questions.</p>
      </div>
    `;
  } else if (status === 'accepted') {
    // Email template for order acceptance notification to shopkeeper
    subject = `✅ Order Accepted - ${orderId}`;
    text = `Your order has been accepted by ${distributorName || 'your distributor'}.\n\nOrder ID: ${orderId}\nDistributor: ${distributorName || 'N/A'}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}\n\nYour order is now being processed. You will be notified when it's ready for delivery.`;
    
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #16a34a; margin: 0;">✅ Order Accepted</h1>
          <p style="color: #4b5563; margin: 5px 0 0;">Your order #${orderId} has been accepted</p>
        </div>
        
        <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #16a34a;">
          <p style="margin: 5px 0; color: #166534;">
            <strong>${distributorName || 'Your distributor'}</strong> has accepted your order and is now processing it.
          </p>
        </div>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin: 5px 0;"><strong>Distributor:</strong> ${distributorName || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Total Amount:</strong> Rs${totalAmount}</p>
        </div>
        
        <h3 style="color: #1e40af; margin-bottom: 10px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0;">Product</th>
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">Qty</th>
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">Price</th>
              <th style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9;">
                  ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; margin-right: 10px;" />` : ''}
                  ${item.name}
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">${item.qty}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">Rs${item.price}</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; text-align: right;">Rs${(item.qty * item.price).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align: right; padding: 10px; font-weight: bold;">Total:</td>
              <td style="text-align: right; padding: 10px; font-weight: bold;">Rs${totalAmount}</td>
            </tr>
          </tfoot>
        </table>
        
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 14px; color: #4b5563;">
          <p style="margin: 0 0 10px 0;"><strong>Next Steps:</strong></p>
          <ol style="margin: 0; padding-left: 20px;">
            <li>Your order is now being processed by ${distributorName || 'your distributor'}</li>
            <li>You will receive another email when your order is ready for delivery</li>
            <li>For any questions, please contact your distributor directly</li>
          </ol>
        </div>
        
        <div style="text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
          <a href="${process.env.FRONTEND_URL || 'https://your-orderly-app.com'}/shop/orders" 
             style="display: inline-block; background-color: #16a34a; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; font-weight: 500; margin-bottom: 10px;">
            View Order Status
          </a>
          <p style="margin: 15px 0 0 0; font-size: 13px; color: #64748b;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </div>
    `;
  }
  
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  return info;
}

// Dedicated function for shopkeeper order status updates
export async function sendOrderStatusUpdateEmail(to, { orderId, shopName, items, status, statusText }) {
  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.price), 0).toFixed(2);
  const productLines = items.map((item, idx) => `${idx + 1}. ${item.name} x${item.qty} - Rs${(item.qty * item.price).toFixed(2)}`).join('\n');
  
  let subject, text, html, emoji, color;
  
  switch (status) {
    case 'placed':
      emoji = '✅';
      color = '#16a34a';
      subject = `${emoji} Order Confirmed & Placed - ${orderId}`;
      text = `Great news! Your order has been confirmed and placed.\n\nOrder ID: ${orderId}\nShop: ${shopName}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}\n\n📦 Your order is now being prepared for delivery.`;
      break;
    case 'out_for_delivery':
      emoji = '🚚';
      color = '#ea580c';
      subject = `${emoji} Order Out for Delivery - ${orderId}`;
      text = `Your order is now out for delivery!\n\nOrder ID: ${orderId}\nShop: ${shopName}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}\n\n📍 Expected delivery: Today or within 1-2 business days.`;
      break;
    default:
      emoji = '📦';
      color = '#3b82f6';
      subject = `${emoji} Order Update - ${orderId}`;
      text = `Your order status has been updated to: ${statusText}\n\nOrder ID: ${orderId}\nShop: ${shopName}\nTotal: Rs${totalAmount}\n\nProducts:\n${productLines}`;
  }
  
  html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: ${color};">${emoji} ${status === 'placed' ? 'Order Confirmed & Placed' : status === 'out_for_delivery' ? 'Order Out for Delivery' : 'Order Update'}</h2>
      <p>${status === 'placed' ? 'Great news! Your order has been <strong>confirmed and placed</strong> by the distributor.' : status === 'out_for_delivery' ? 'Your order is now <strong>out for delivery</strong>!' : `Your order status has been updated to: <strong>${statusText}</strong>`}</p>
      
      <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Shop:</strong> ${shopName}</p>
        <p><strong>Total Amount:</strong> Rs${totalAmount}</p>
      </div>
      
      <h3>Products:</h3>
      <ul style="background: #f1f5f9; padding: 15px; border-radius: 6px;">
        ${items.map(item => `<li>${item.name} x${item.qty} - Rs${(item.qty * item.price).toFixed(2)}</li>`).join('')}
      </ul>
      
      ${status === 'placed' ? '<p style="color: #059669; font-weight: bold;">📦 Your order is now being prepared for delivery.</p>' : ''}
      ${status === 'out_for_delivery' ? '<p style="color: #ea580c; font-weight: bold;">📍 Expected delivery: Today or within 1-2 business days</p><p>Please keep your shop open to receive the delivery.</p>' : ''}
    </div>
  `;
  
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  return info;
}

export async function sendOtpEmail(to, otp) {
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
  const subjectTmpl = process.env.SMTP_SUBJECT || 'Your verification code';
  const textTmpl =
    process.env.SMTP_TEXT_TEMPLATE || 'Your verification code is {{otp}}. It expires in {{minutes}} minutes.';
  const htmlTmpl =
    process.env.SMTP_HTML_TEMPLATE || '<p>Your verification code is <b>{{otp}}</b>. It expires in {{minutes}} minutes.</p>';

  const subject = subjectTmpl.replaceAll('{{otp}}', otp).replaceAll('{{minutes}}', String(minutes));
  const text = textTmpl.replaceAll('{{otp}}', otp).replaceAll('{{minutes}}', String(minutes));
  const html = htmlTmpl.replaceAll('{{otp}}', otp).replaceAll('{{minutes}}', String(minutes));

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
  return info;
}
