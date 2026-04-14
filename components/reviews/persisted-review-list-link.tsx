"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { ComponentProps } from "react";
import {
    readStoredReviewListHref,
    subscribeReviewListPreference,
} from "@/lib/reviews/review-list-preference";

type PersistedReviewListLinkProps = ComponentProps<typeof Link> & {
    listPath: string;
};

export function PersistedReviewListLink({
    href,
    listPath,
    ...props
}: PersistedReviewListLinkProps) {
    const fallbackHref = typeof href === "string" ? href : listPath;
    const resolvedHref = useSyncExternalStore(
        subscribeReviewListPreference,
        () => readStoredReviewListHref(listPath) ?? fallbackHref,
        () => fallbackHref,
    );

    return <Link href={resolvedHref} {...props} />;
}
