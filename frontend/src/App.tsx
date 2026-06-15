import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { HomePage } from "./pages/HomePage";
import { AddJourneyPage } from "./pages/journeys/AddJourneyPage";
import { JourneysLayout } from "./pages/journeys/JourneysLayout";
import { JourneysMapView } from "./pages/journeys/JourneysMapView";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          {/*
           * Раздел Journeys — общий каркас (шапка + панель) с под-вкладками через
           * <Outlet/>. Индексный маршрут показывает карту, «add» — форму добавления
           * поездки; movements/all/wishlist пока заглушки (element={null}) — маршруты
           * заведены, чтобы навигация в панели подсвечивалась, контент появится по мере готовности.
           */}
          <Route
            path="/journeys"
            element={
              <ProtectedRoute>
                <JourneysLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<JourneysMapView />} />
            <Route path="movements" element={null} />
            <Route path="all" element={null} />
            <Route path="wishlist" element={null} />
            <Route path="add" element={<AddJourneyPage />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
