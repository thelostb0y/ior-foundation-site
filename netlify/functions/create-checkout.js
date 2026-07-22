// Creates a Stripe Checkout Session for It's Only Right Weekend registration.
// Requires the Netlify environment variable STRIPE_SECRET_KEY (sk_test_... or sk_live_...).
const Stripe = require('stripe');

const REQUIRED = [
  'camper-name', 'camper-dob', 'camper-age', 'allergies',
  'shirt-size', 'parent-first-name', 'parent-last-name', 'parent-phone'
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return json(503, { error: 'Online payment is not set up yet. Please try again soon or contact the foundation.' });
  }

  let data;
  try { data = JSON.parse(event.body || '{}'); }
  catch (e) { return json(400, { error: 'Invalid request.' }); }

  // Honeypot: silently reject bots.
  if (data['bot-field']) return json(400, { error: 'Submission rejected.' });

  for (const f of REQUIRED) {
    if (!data[f] || String(data[f]).trim() === '') {
      return json(400, { error: 'Please complete all required fields.' });
    }
  }

  const full = data['payment-type'] === 'full';
  const amount = full ? 4000 : 1000; // cents
  const label = full
    ? "It's Only Right Weekend — Full Camp Registration"
    : "It's Only Right Weekend — Registration Deposit";
  const balanceDue = full ? '$0 (paid in full)' : '$30 due at camp';

  const metadata = {
    event: "It's Only Right Weekend 2026",
    camper_name: str(data['camper-name']),
    camper_dob: str(data['camper-dob']),
    camper_age: str(data['camper-age']),
    allergies: str(data['allergies']),
    shirt_size: str(data['shirt-size']),
    parent_name: str(data['parent-first-name']) + ' ' + str(data['parent-last-name']),
    parent_phone: str(data['parent-phone']),
    parent_email: str(data['parent-email'] || ''),
    payment_type: full ? 'full' : 'deposit',
    amount_paid: full ? '$40.00' : '$10.00',
    balance_due: balanceDue
  };

  const origin = event.headers.origin ||
    ((event.headers['x-forwarded-proto'] || 'https') + '://' + (event.headers.host || ''));

  try {
    const stripe = Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: label,
            description: 'Camper: ' + metadata.camper_name + " • Aug 7-8, 2026 • Bethel's Family Church, Houston"
          }
        }
      }],
      customer_email: data['parent-email'] || undefined,
      metadata: metadata,
      payment_intent_data: { metadata: metadata },
      success_url: origin + '/thanks.html?paid=1',
      cancel_url: origin + '/register.html?canceled=1'
    });
    return json(200, { url: session.url });
  } catch (e) {
    return json(500, { error: 'We could not start the payment. Please try again.' });
  }
};

function str(v) { return String(v == null ? '' : v).slice(0, 480); }
function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
