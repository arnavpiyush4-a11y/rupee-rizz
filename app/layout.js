import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'RupeeRizz \u2014 Your friendly money mate',
  description: 'A consent-based financial wellbeing coach for Indian students & micro-entrepreneurs. Save smarter, borrow responsibly.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);' }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
