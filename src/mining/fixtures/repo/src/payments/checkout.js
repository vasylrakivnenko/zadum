import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createCheckoutSession(invoice) {
  return stripe.checkout.sessions.create({ mode: "payment", line_items: invoice.lines });
}
