import { categoriesHandlers } from "./categories";
import { storefrontHandlers } from "./storefront";
import { accountHandlers } from "./account";
import { checkoutHandlers } from "./checkout";
import { adminHandlers } from "./admin";
import { phoneLeadHandlers } from "./phone-leads";
import { adminOrderHandlers } from "./admin-orders";
import { adminPushHandlers } from "./admin-push";
import { cartPriceHandlers } from "./cart-prices";
import { promoHandlers } from "./promos";

/** Central handler list. Each feature file contributes its own array. */
export const handlers = [
  ...adminOrderHandlers,
  ...adminPushHandlers,
  ...cartPriceHandlers,
  ...promoHandlers,
  ...adminHandlers,
  ...categoriesHandlers,
  ...storefrontHandlers,
  ...accountHandlers,
  ...checkoutHandlers,
  ...phoneLeadHandlers,
];
