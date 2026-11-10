
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/customer/Home";
import Cart from "./pages/customer/Cart";
import MyOrders from "./pages/customer/MyOrders";
import Checkout from "./pages/customer/Checkout";
import Offers from "./pages/customer/Offers";
import ProductDetails from "./pages/customer/ProductDetails";
import OrderSuccess from "./pages/customer/OrderSuccess";
import MyProfile from "./pages/customer/MyProfile";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import MyAddresses from "./pages/customer/MyAddresses";

import Dashboard from "./pages/admin/Dashboard";
import Products from "./pages/admin/Products";
import Inventory from "./pages/admin/Inventory";
import Orders from "./pages/admin/Orders";
import Settings from "./pages/admin/Settings";
import MyNotifications from "./pages/customer/MyNotifications";
import ScrollRestoration from "./components/customer/ScrollRestoration";
import Customers from "./pages/admin/Customers";
import Coupons from "./pages/admin/Coupons";
import Notifications from "./pages/admin/Notifications";
import AdminManagement from "./pages/admin/AdminManagement";
import Payments from "./pages/admin/Payments";
import AdminLayout from "./components/admin/AdminLayout";
import CustomerLayout from "./components/customer/CustomerLayout";
import Categories from "./pages/admin/Categories";
import Homepage from "./pages/admin/Homepage";
import AdminRegister from "./pages/admin/AdminRegister";

function App() {
  return (
    <BrowserRouter>
      <ScrollRestoration />

      <Routes>

        {/* Customer routes */}
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/my-orders" element={<MyOrders />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/products/:productId" element={<ProductDetails />} />
          <Route
            path="/order-success/:orderId"
            element={<OrderSuccess />}
          />
          <Route path="/my-profile" element={<MyProfile />} />
          <Route path="/my-addresses" element={<MyAddresses />} />
          <Route path="my-notifications" element={<MyNotifications />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Admin Registration - Public Route */}
        <Route path="/admin/register" element={<AdminRegister />} />

        {/* Admin routes */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="orders" element={<Orders />} />
          <Route path="settings" element={<Settings />} />
          <Route path="categories" element={<Categories />} />
          <Route path="homepage" element={<Homepage />} />
          <Route path="customers" element={<Customers />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="management" element={<AdminManagement />} />
          <Route path="admins" element={<AdminManagement />} />
          <Route path="payments" element={<Payments />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
