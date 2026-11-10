
from getpass import getpass

from app.database import SessionLocal
from app.models.user import User
from app.auth.security import hash_password, verify_password


ADMIN_EMAIL = "goutam99store@gmail.com"


def reset_password():
    db = SessionLocal()

    try:
        # Find the existing Super Admin
        admin = db.query(User).filter(
            User.email == ADMIN_EMAIL
        ).first()

        if not admin:
            print("Super Admin account not found.")
            return

        if admin.role != "super_admin":
            print("This account is not a Super Admin.")
            return

        if not admin.is_active:
            print("This Super Admin account is inactive.")
            return

        # Enter the new password privately
        new_password = getpass("Enter your new password: ")
        confirm_password = getpass("Confirm your new password: ")

        if not new_password:
            print("Password cannot be empty.")
            return

        if new_password != confirm_password:
            print("Passwords do not match.")
            return

        # Update the password
        admin.hashed_password = hash_password(new_password)

        db.commit()

        # Verify the new password
        if verify_password(new_password, admin.hashed_password):
            print("\nSuper Admin password updated successfully!")
        else:
            print("\nPassword verification failed.")

    except Exception as e:
        db.rollback()
        print("Error:", e)

    finally:
        db.close()


if __name__ == "__main__":
    reset_password()
