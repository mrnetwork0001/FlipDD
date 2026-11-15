import Link from "next/link";
import FlipLogo from "@/components/FlipLogo";
import { CopyLinkButton } from "@/app/brief/[id]/PrintButton";

/** The investor profile's top bar, as on the meeting brief: the logo, and Copy link when there is a page to share. */
export default function TopBar({ copy = true }: { copy?: boolean }) {
  return (
    <header className="border-b border-line/70 print:hidden">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-5 sm:px-8">
        <Link href="/" className="flex items-center transition hover:opacity-75" aria-label="FlipDD">
          <FlipLogo height={26} />
        </Link>
        {copy && <CopyLinkButton />}
      </div>
    </header>
  );
}
