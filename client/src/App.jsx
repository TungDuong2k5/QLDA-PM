import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import CheckoutAlert from './components/CheckoutAlert';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SalesEntry from './pages/SalesEntry';
import TablePicker from './pages/TablePicker';
import Tables from './pages/Tables';
import Menu from './pages/Menu';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import Checkout from './pages/Checkout';
import OrderDetail from './pages/OrderDetail';
import Ingredients from './pages/Ingredients';
import Staff from './pages/Staff';
import Account from './pages/Account';
import StockCheck from './pages/StockCheck';

export default function App() {
  return (
    <>
      <Navbar />
      <CheckoutAlert />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute staffOnly><SalesEntry /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/tables/pick" element={<PrivateRoute staffOnly><TablePicker /></PrivateRoute>} />
        <Route path="/tables" element={<PrivateRoute><Tables /></PrivateRoute>} />
        <Route path="/menu" element={<PrivateRoute adminOnly><Menu /></PrivateRoute>} />
        <Route path="/ingredients" element={<PrivateRoute adminOnly><Ingredients /></PrivateRoute>} />
        <Route path="/staff" element={<PrivateRoute adminOnly><Staff /></PrivateRoute>} />
        <Route path="/stock-check" element={<PrivateRoute><StockCheck /></PrivateRoute>} />
        <Route path="/account" element={<PrivateRoute><Account /></PrivateRoute>} />
        <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
        <Route path="/orders/new" element={<PrivateRoute staffOnly><NewOrder /></PrivateRoute>} />
        <Route path="/orders/checkout" element={<PrivateRoute staffOnly><Checkout /></PrivateRoute>} />
        <Route path="/orders/:id" element={<PrivateRoute><OrderDetail /></PrivateRoute>} />
      </Routes>
    </>
  );
}
