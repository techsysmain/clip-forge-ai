import type { Metadata } from "next";
import { H2, LegalDoc, Note, P, UL } from "@/components/legal-doc";
import { legalInfo } from "@/lib/legal";

export const metadata: Metadata = { title: "Copyright & DMCA Policy – ClipForge AI" };

export default function Copyright() {
  const l = legalInfo();
  return (
    <LegalDoc title="Copyright & DMCA Policy" updated={l.updated}>
      <P>
        {l.company} respects intellectual property rights and expects users to do the same. Users must confirm they have the necessary rights before processing any
        video, and ClipForge AI does not download media from YouTube or other platforms.
      </P>

      <H2>1. Reporting alleged infringement</H2>
      <P>If you believe content processed or stored through the Service infringes your copyright, send a written notice to our designated agent at <a className="underline" href={`mailto:${l.email}`}>{l.email}</a> containing:</P>
      <UL>
        <li>Your physical or electronic signature (or that of the authorized agent).</li>
        <li>Identification of the copyrighted work you claim is infringed.</li>
        <li>Identification of the material and information reasonably sufficient for us to locate it (for example the project or clip link).</li>
        <li>Your name, address, telephone number and email address.</li>
        <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement, under penalty of perjury, that the information is accurate and that you are the owner or authorized to act for the owner.</li>
      </UL>
      <Note>Knowingly misrepresenting that material is infringing may make you liable for damages under 17 U.S.C. § 512(f) and equivalent laws.</Note>

      <H2>2. What we do</H2>
      <UL>
        <li>We review complete notices promptly and may remove or disable access to the identified material.</li>
        <li>We notify the affected user and may share the notice with them.</li>
        <li>Because private projects are only visible to their owner, we may need the project or clip identifier to act.</li>
      </UL>

      <H2>3. Counter-notice</H2>
      <P>
        If your content was removed in error, you may send a counter-notice containing your signature, identification of the removed material and its former location, a
        statement under penalty of perjury that you believe the removal was a mistake or misidentification, your contact details, and consent to the jurisdiction of the courts
        for your address (or, outside the United States, of {l.jurisdiction}). If the complainant does not notify us of a court action within 10–14 business days, we may restore the material.
      </P>

      <H2>4. Repeat infringers</H2>
      <P>We will terminate accounts of users who are repeatedly found to infringe copyright, in appropriate circumstances.</P>

      <H2>5. Other jurisdictions</H2>
      <P>We also act on valid notices under the EU Digital Services Act, UK law and other applicable notice-and-action regimes sent to the address above.</P>
    </LegalDoc>
  );
}
