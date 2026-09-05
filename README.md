<a href="https://demo-nextjs-with-supabase.vercel.app/">
  <img alt="Next.js and Supabase Starter Kit - the fastest way to build apps with Next.js and Supabase" src="https://demo-nextjs-with-supabase.vercel.app/opengraph-image.png">
  <h1 align="center">Next.js and Supabase Starter Kit</h1>
</a>

<p align="center">
 The fastest way to build apps with Next.js and Supabase
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#demo"><strong>Demo</strong></a> ·
  <a href="#deploy-to-vercel"><strong>Deploy to Vercel</strong></a> ·
  <a href="#clone-and-run-locally"><strong>Clone and run locally</strong></a> ·
  <a href="#feedback-and-issues"><strong>Feedback and issues</strong></a>
  <a href="#more-supabase-examples"><strong>More Examples</strong></a>
</p>
<br/>

## Features

- Works across the entire [Next.js](https://nextjs.org) stack
  - App Router
  - Pages Router
  - Proxy
  - Client
  - Server
  - It just works!
- supabase-ssr. A package to configure Supabase Auth to use cookies
- Password-based authentication block installed via the [Supabase UI Library](https://supabase.com/ui/docs/nextjs/password-based-auth)
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Components with [shadcn/ui](https://ui.shadcn.com/)
- Optional deployment with [Supabase Vercel Integration and Vercel deploy](#deploy-your-own)
  - Environment variables automatically assigned to Vercel project

## Demo

You can view a fully working demo at [demo-nextjs-with-supabase.vercel.app](https://demo-nextjs-with-supabase.vercel.app/).

## Deploy to Vercel

Vercel deployment will guide you through creating a Supabase account and project.

After installation of the Supabase integration, all relevant environment variables will be assigned to the project so the deployment is fully functioning.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&project-name=nextjs-with-supabase&repository-name=nextjs-with-supabase&demo-title=nextjs-with-supabase&demo-description=This+starter+configures+Supabase+Auth+to+use+cookies%2C+making+the+user%27s+session+available+throughout+the+entire+Next.js+app+-+Client+Components%2C+Server+Components%2C+Route+Handlers%2C+Server+Actions+and+Middleware.&demo-url=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2F&external-id=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-supabase&demo-image=https%3A%2F%2Fdemo-nextjs-with-supabase.vercel.app%2Fopengraph-image.png)

The above will also clone the Starter kit to your GitHub, you can clone that locally and develop locally.

If you wish to just develop locally and not deploy to Vercel, [follow the steps below](#clone-and-run-locally).

## Clone and run locally

1. You'll first need a Supabase project which can be made [via the Supabase dashboard](https://database.new)

2. Create a Next.js app using the Supabase Starter template npx command

   ```bash
   npx create-next-app --example with-supabase with-supabase-app
   ```

   ```bash
   yarn create next-app --example with-supabase with-supabase-app
   ```

   ```bash
   pnpm create next-app --example with-supabase with-supabase-app
   ```

3. Use `cd` to change into the app's directory

   ```bash
   cd with-supabase-app
   ```

4. Rename `.env.example` to `.env.local` and update the following:

  ```env
  NEXT_PUBLIC_SUPABASE_URL=[INSERT SUPABASE PROJECT URL]
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=[INSERT SUPABASE PROJECT API PUBLISHABLE OR ANON KEY]
  ```
  > [!NOTE]
  > This example uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which refers to Supabase's new **publishable** key format.
  > Both legacy **anon** keys and new **publishable** keys can be used with this variable name during the transition period. Supabase's dashboard may show `NEXT_PUBLIC_SUPABASE_ANON_KEY`; its value can be used in this example.
  > See the [full announcement](https://github.com/orgs/supabase/discussions/29260) for more information.

  Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` can be found in [your Supabase project's API settings](https://supabase.com/dashboard/project/_?showConnect=true)

5. You can now run the Next.js local development server:

   ```bash
   npm run dev
   ```

   The starter kit should now be running on [localhost:3000](http://localhost:3000/).

6. This template comes with the default shadcn/ui style initialized. If you instead want other ui.shadcn styles, delete `components.json` and [re-install shadcn/ui](https://ui.shadcn.com/docs/installation/next)

> Check out [the docs for Local Development](https://supabase.com/docs/guides/getting-started/local-development) to also run Supabase locally.

## Feedback and issues

Please file feedback and issues over on the [Supabase GitHub org](https://github.com/supabase/supabase/issues/new/choose).

## Message Centre environment variables

For the unified WhatsApp + Facebook Messenger Message Centre, set these variables:

```env
OPENROUTER_API_KEY=
AI_MODEL=openai/gpt-4o-mini
META_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
TWILIO_ACCOUNT_SID= # optional fallback when DB Twilio connections are not configured
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_MESSAGING_SERVICE_SID=
```

Messenger page credentials are configured from the app in `Message Centre Settings` and stored in the `messaging_pages` table. Twilio credentials can now be configured per AI agent in the same settings screen (`twilio_connections` table), with env vars used only as fallback.

## Website chat widget

1. Deploy the CRM after the website-chat migration has been applied.
2. In `Message Centre Settings` → `Connections`, add the exact website origin (for example, `https://www.edusphere.edu.sg`) under **Website chat widget** and save.
3. Copy the generated script and paste it before `</body>` on that website:

```html
<script src="https://YOUR-CRM-DOMAIN/widget.js" data-widget-key="YOUR-WIDGET-KEY" async></script>
```

The widget stores visitor name, email, phone, interested courses, qualification evidence, transcript, and source page on the conversation. It does not create or modify lead records; agents continue to use the existing manual lead workflow.

## Website callback and appointment requests

After applying `20260816000100_add_callback_requests.sql` and `20260823000200_add_appointment_booking.sql`, the public EduSphere website can submit callbacks and counselling appointments through:

```text
POST https://YOUR-CRM-DOMAIN/api/public/callback-requests
```

Use the same allowed website origin and website key configured for the chat widget. The form must submit `fullName`, `email`, `phone`, `course`, `preferredDate` (`YYYY-MM-DD`), `preferredTime` (`HH:MM`), `sourceUrl`, and `publicKey`. `requestType` defaults to `callback`. For appointments, also send `appointmentMode` (`phone`, `video`, or `campus`) and optional `durationMinutes` (defaults to 30). `preferredTimezone`, `referrer`, `utm`, and a hidden `website` honeypot field are optional.

Staff manage both types under **Leads → Callbacks & appointments**.

```ts
await fetch("https://YOUR-CRM-DOMAIN/api/public/callback-requests", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publicKey: "YOUR-WEBSITE-KEY",
    sourceUrl: window.location.href,
    referrer: document.referrer,
    requestType: values.requestType, // "callback" | "appointment"
    appointmentMode: values.appointmentMode, // required for appointments
    durationMinutes: 30,
    fullName: values.name,
    email: values.email,
    phone: values.phone,
    course: values.course, // selected from the EduSphere website course list
    preferredDate: values.callbackDate,
    preferredTime: values.callbackTime,
    preferredTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    website: values.website, // hidden honeypot; leave blank
  }),
});
```

The API matches by normalized phone first, then email. It creates a new website lead only when neither matches, then links the callback request and records it in the lead timeline. CRM users can manage requests from **Leads → Callback requests** or on the lead’s **Callback requests** tab.

## Website classroom rentals

After applying `20260905070000_add_classroom_rentals.sql` and
`20260905074500_add_multi_date_classroom_rentals.sql`, users can book classrooms through:

```text
GET|POST https://YOUR-CRM-DOMAIN/api/public/classroom-rentals
```

A built-in booking page is available at:

```text
https://YOUR-CRM-DOMAIN/classroom-rental
```

Rules enforced by the API and database:

- Monday to Friday bookings only
- Full-day slot starts at `09:00`
- End time can be `18:00`, `19:00`, or `20:00`
- Same classroom/date cannot be double-booked while an active booking exists
- A single submission can include multiple booking dates (`bookingDates`)

CRM users can manage these bookings from **Leads → Classroom rentals** using the calendar view.

## More Supabase examples

- [Next.js Subscription Payments Starter](https://github.com/vercel/nextjs-subscription-payments)
- [Cookie-based Auth and the Next.js 13 App Router (free course)](https://youtube.com/playlist?list=PL5S4mPUpp4OtMhpnp93EFSo42iQ40XjbF)
- [Supabase Auth and the Next.js App Router](https://github.com/supabase/supabase/tree/master/examples/auth/nextjs)
