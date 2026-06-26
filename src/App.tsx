import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import TitleBar from './components/TitleBar'
import NavBar from './components/NavBar'
import SystemStatusPopup from './components/SystemStatusPopup'
import ChatPage from './pages/ChatPage'
import EmailPage from './pages/EmailPage'
import TasksPage from './pages/TasksPage'
import WhatsAppPage from './pages/WhatsAppPage'
import WhatsAppRequestsPage from './pages/WhatsAppRequestsPage'
import ObsidianPage from './pages/ObsidianPage'
import ActivityLogPage from './pages/ActivityLogPage'
import SettingsPage from './pages/SettingsPage'
import DeveloperPage from './pages/DeveloperPage'

export default function App() {
  const {
    currentPage,
    setSettings, setSettingsLoaded, setConnection,
    showSystemStatus,
    setWhatsappQR, addWhatsappRequest, setWhatsappRequests,
    setCurrentPage,
  } = useAppStore()

  useEffect(() => {
    const init = async () => {
      try {
        const s = await window.zeno.settings.get()
        setSettings(s)
        setSettingsLoaded(true)

        setConnection({ activeProvider: s.activeProvider || 'lmstudio' })
        if (s.lmStudioModel) setConnection({ currentModel: s.lmStudioModel })

        setConnection({ lmStudio: 'checking' })
        const lmResult = await window.zeno.lmstudio.test()
        setConnection({
          lmStudio: lmResult.connected ? 'connected' : 'disconnected',
          currentModel: lmResult.models?.[0] || s.lmStudioModel || '',
        })

        setConnection({ obsidian: 'checking' })
        const obResult = await window.zeno.obsidian.test()
        setConnection({ obsidian: obResult.exists ? 'found' : 'not_found' })

        const providerStatus = await window.zeno.provider.status()
        setConnection({
          claude: providerStatus.claudeConfigured ? 'configured' : 'not_configured',
        })

        const waStatus = await window.zeno.whatsapp.status()
        if (waStatus.available) {
          setConnection({ whatsapp: (waStatus.status as any) || 'disabled' })
        }

        const reqs = await window.zeno.whatsapp.requests.get()
        setWhatsappRequests(reqs)

        if (s.pcBridgeEnabled) {
          const bridgeResult = await window.zeno.bridge.health()
          setConnection({ bridge: bridgeResult.connected ? 'connected' : 'disconnected' })
        }
      } catch (e) {
        console.error('Init failed:', e)
        setSettingsLoaded(true)
      }
    }
    init()

    window.zeno.whatsapp.onStatus((status) => {
      setConnection({ whatsapp: status as any })
    })
    window.zeno.whatsapp.onQR((qr) => {
      setWhatsappQR(qr)
      setCurrentPage('whatsapp')
      setConnection({ whatsapp: 'qr_pending' })
    })
    window.zeno.whatsapp.onReady(() => {
      setWhatsappQR(null)
      setConnection({ whatsapp: 'connected' })
    })
    window.zeno.whatsapp.onDisconnected(() => {
      setConnection({ whatsapp: 'disconnected' })
    })
    window.zeno.whatsapp.onNewRequest((req) => {
      addWhatsappRequest(req as any)
    })

    return () => {
      window.zeno.whatsapp.removeAllListeners()
    }
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'chat':            return <ChatPage />
      case 'email':           return <EmailPage />
      case 'tasks':           return <TasksPage />
      case 'whatsapp':        return <WhatsAppPage />
      case 'whatsapp-requests': return <WhatsAppRequestsPage />
      case 'obsidian':        return <ObsidianPage />
      case 'activity-log':    return <ActivityLogPage />
      case 'settings':        return <SettingsPage />
      case 'developer':       return <DeveloperPage />
      default:                return <ChatPage />
    }
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <NavBar />
        <main className="app-main">
          {renderPage()}
        </main>
      </div>
      {showSystemStatus && <SystemStatusPopup />}
    </div>
  )
}
