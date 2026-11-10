export interface Address {
  id: number;
  user_id: number;
  label: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
}

export interface AddressFormData {
  label: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export const emptyAddressForm: AddressFormData = {
  label: "Home",
  recipient_name: "",
  phone: "",
  address_line: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
  is_default: false,
};

export function formatAddress(address: Address): string {
  return [
    address.address_line,
    address.landmark,
    address.city,
    address.state,
    address.pincode,
  ]
    .filter(Boolean)
    .join(", ");
}