
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Chat from "./pages/Chat.jsx";
import Home from "./pages/Home.jsx";
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return(
    <BrowserRouter>
        <Routes>
            <Route path="/" element={<Home />}/>
            <Route path="chat" element={<Chat />}/>
            <Route path="*" element={<NotFound />} />
        </Routes>
    </BrowserRouter>
  );
}
