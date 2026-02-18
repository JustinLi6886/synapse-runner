import './App.css'
import { GameView } from './game/GameView'

function App() {
  return (
    <div className="app">
      <div className="panel left-panel">
        neural network
      </div>
      <div className="panel right-panel">
        <GameView />
      </div>
    </div>
  )
}

export default App
