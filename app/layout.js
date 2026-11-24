import './globals.css'
import { Providers } from './providers'
import { publicConfig } from '@/lib/supabase/public-config'

// Supabase public values belong to this deployment, not to the reusable image.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'RupeeRizz \u2014 Your friendly money mate',
  description: 'A consent-based financial wellbeing coach for Indian students & micro-entrepreneurs. Save smarter, borrow responsibly.',
}

export default function RootLayout({ children }) {
  const supabaseConfig = publicConfig(process.env)
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);' }} />
      </head>
      <body>
        <Providers supabaseConfig={supabaseConfig}>{children}</Providers>
      </body>
    </html>
  )
}
