import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
    title: "Refund & Return Policy — SV Car Customs",
    description:
        "We do not accept returns or issue refunds. Products delivered damaged can be exchanged within 4 days of delivery with a complete unboxing video.",
    alternates: { canonical: absoluteUrl("/refund") },
};

const UPDATED = "22 August 2026";

export default function RefundPolicyPage() {
    return (
        <div className="max-w-3xl mx-auto px-4 py-14">
            <header className="mb-10">
                <span className="badge badge-bestseller mb-4">Legal</span>
                <h1 className="text-3xl md:text-4xl font-extrabold text-text-primary tracking-tight mb-2">
                    Refund &amp; Return Policy
                </h1>
                <p className="text-sm text-text-muted">Last updated: {UPDATED}</p>
            </header>

            <div className="space-y-8 text-[15px] text-text-secondary leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mb-2 [&_h2]:mt-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-brand-orange [&_a:hover]:underline">
                <section>
                    <p>
                        Please read this policy carefully before placing an order.{" "}
                        <strong>We do not accept returns and we do not issue refunds.</strong>{" "}
                        The only remedy we offer is an exchange for a product that reaches you
                        damaged, on the conditions set out below.
                    </p>
                </section>

                <section>
                    <h2>No returns, no refunds</h2>
                    <p>
                        Once an order is placed and delivered, it cannot be returned and the
                        amount paid is not refundable. This includes change of mind, incorrect
                        ordering, fitment issues discovered after delivery, and delays outside
                        our control. We strongly recommend confirming fitment for your exact
                        make, model and variant with us before you order &mdash; message us on{" "}
                        <a
                            href="https://wa.me/919205005425"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            WhatsApp
                        </a>{" "}
                        and we&rsquo;ll confirm it for you.
                    </p>
                </section>

                <section>
                    <h2>Exchange for damaged products</h2>
                    <p>
                        If a product is <strong>delivered damaged</strong>, we will exchange it
                        for the same product. An exchange is the only remedy available &mdash;
                        we do not offer a refund in place of it. To be eligible, all of the
                        following must be true:
                    </p>
                    <ul>
                        <li>
                            The claim is raised within <strong>4 days of delivery</strong>.
                            Claims after this window cannot be accepted.
                        </li>
                        <li>
                            You have a <strong>complete, unedited unboxing video</strong> that
                            shows the sealed parcel before opening and continues without a cut
                            until the product is fully unpacked and the damage is visible.
                        </li>
                        <li>
                            The damage was present on delivery &mdash; not caused by
                            installation, fitting, use or handling after unboxing.
                        </li>
                        <li>
                            The product, along with its original packaging and all accessories,
                            is available for us to collect.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>About the unboxing video</h2>
                    <p>
                        The unboxing video is mandatory and is the only proof we accept for a
                        damage claim. It must be one continuous recording &mdash; a video that
                        starts after the parcel is already open, or that is paused, trimmed or
                        edited, cannot be accepted. Photos alone are not sufficient. Please start
                        recording before you break the seal on every order.
                    </p>
                </section>

                <section>
                    <h2>How to raise an exchange claim</h2>
                    <ul>
                        <li>
                            Within 4 days of delivery, email{" "}
                            <a href="mailto:support@svcarcustoms.in">
                                support@svcarcustoms.in
                            </a>{" "}
                            or message us on{" "}
                            <a
                                href="https://wa.me/919205005425"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                WhatsApp
                            </a>{" "}
                            with your order number and the complete unboxing video.
                        </li>
                        <li>
                            We&rsquo;ll review the video and confirm whether the claim is
                            eligible.
                        </li>
                        <li>
                            If it is, we&rsquo;ll arrange pickup of the damaged product and
                            dispatch the replacement at no extra cost to you.
                        </li>
                    </ul>
                </section>

                <section>
                    <h2>Order cancellations</h2>
                    <p>
                        <strong>Orders cannot be cancelled once placed</strong> &mdash; not even
                        before dispatch. Please be certain of your product and its fitment before
                        you confirm the order.
                    </p>
                    <p>
                        For Cash on Delivery orders, the advance paid online at checkout is{" "}
                        <strong>non-refundable</strong> and is not returned once the order is
                        placed.
                    </p>
                </section>

                <section>
                    <h2>Need help?</h2>
                    <p>
                        Reach us at{" "}
                        <a href="mailto:support@svcarcustoms.in">support@svcarcustoms.in</a> or{" "}
                        <a href="tel:+919205005425">+91 92050 05425</a>. See our{" "}
                        <a href="/contact">Contact page</a> for hours and address.
                    </p>
                </section>
            </div>
        </div>
    );
}
