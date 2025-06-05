import React from 'react';
import { Navbar as BootstrapNavbar, Nav, Button, Container } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleHome = () => {
    navigate('/');
  };

  if (!user) return null;

  return (
    <BootstrapNavbar bg="primary" variant="dark" expand="lg" className="mb-3">
      <Container>
        <BootstrapNavbar.Brand onClick={handleHome} style={{ cursor: 'pointer' }}>
          StudyBuddy
        </BootstrapNavbar.Brand>
        <BootstrapNavbar.Toggle aria-controls="basic-navbar-nav" />
        <BootstrapNavbar.Collapse id="basic-navbar-nav">
          <Nav className="ms-auto">
            <Nav.Item className="d-flex align-items-center me-3">
              <span className="text-light">Welcome, {user.username}!</span>
            </Nav.Item>
            <Nav.Item>
              <Button variant="outline-light" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </Nav.Item>
          </Nav>
        </BootstrapNavbar.Collapse>
      </Container>
    </BootstrapNavbar>
  );
} 